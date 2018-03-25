# hier-db

A minimalist, indexed hierarchical data structure, used by the [typesmith](https://www.github.com/bbor/typesmith) and [mixtape](https://www.github.com/bbor/mixtape) projects.

## Usage

```js
var hierDb = require('hier-db');

// Create a new database
var db = hierDb();

// Add records to the database:
db.add(record_1);
db.add({
  'name':'record_2',
  'content':'some data',
  'another_field':'whatever'
});
db.add('an empty record that has only a long name');

// Set up a parent-child relationship
db.add_parent(record_1, record_2);

// Find a record by name
var record_by_name = db.find({'name':'whatever'});

// Get a record by UID
var record_by_uid = db.index['some_uid'];

// Get all data objects that are children/parents of another object
var children = db.children_of(record_by_uid);
var parents = db.parents_of(record_by_uid);
// or
var children = db.children_of('some_uid');
var parents = db.parents_of('some_uid');

// Get an array of all records
var all_records = db.all();

// Get all records at the topmost level of the hierarchy: i.e. records without other parents
var top_level = db.children_of(db.root);

```

## Structure

The hier-db holds multiple data records, each of which is a JavaScript object that must contain at minimum a `name` string. Each data object can also contain any other keys and values you want.

### UIDs

For speedy lookups, each record you add to the database is indexed by a unique ID. You can create these UIDs yourself in advance and store them in your data objects, in the `uid` property. If you add a record that doesn't already have a UID, `hier-db` will create one for you and save it on that record.

You can access records by their indexed UIDs using `.index[uid]`.

The auto-generated UID uses the object's `name` value. If that value is already used as a UID, it will append the object's `type` value to disambiguate the new record (see the `disambiguate_by` configuration setting below). If that doesn't produce a unique value, a numeric suffix is incremented and appended.

### Children and parents

Each record in the database can have any number of children, and any number of parents. Note that this allows a given item to exist in multiple places within the hierarchy, unlike many tree implementations.

Also, the parent and child lists contain the UIDs of the other records, not references to the actual data objects. This allows the database to be written out (e.g. to JSON) and read back in without causing any records to get duplicated. The same parent-child relationships remain intact, even when a single record has multiple parents.

## Configuration settings

The `hier-db` structure makes some assumptions about what properties will be used to store the various items of information it needs about each record. For example, each record's UID is stored by default in the `uid` key of that object.

If any of these default keys conflict with data that you're storing in your objects for other reasons, you can configure the keys used for these fields.

The defaults are:

- `name`: Record names are read from the `name` key.
- `uid`: Unique IDs are stored in the `uid` key.
- `children`: The `children` key stores the list of each object's children, expressed as UIDs.
- `parent`: The `parent` key stores the list of each object's parents, expressed as UIDs.
- `disambiguate_by`: When you add a record to the database, its name is adopted as the UID. When you add a second record with the same name, a new UID needs to be generated. If the `disambiguate_by` list contains any strings, then the new UID will be generated by appending the value of each of these keys until a new unique ID is found. The default value is `['type']`.

  So, say you add the record `{'name':'log','type':'object'}`, it gets the UID `log`. Then, if you add another record that is `{'name':'log','type':'function'}`, the new record gets the UID `log_function`.

An example of how to create a `hier-db` object with a different set of keys:

```js
var config = {
  'name':'identifier',
  'uid':'guid',
  'children':'stuff_i_own',
  'parents':'stuff_that_owns_me',
  'disambiguate_by':['alternate','keys']
}

var db = hierDb(config);
```


## Properties

Every instance of `hier-db` has the following properties.

### .index

The `.index` property is an object that makes all data records accessible by their UID. Use it for fast lookups, even on really big databases. For example:

```
var myObject = db.index['object_uid'];
```

### .root

The `.root` property is a special object that acts as the top-level parent in the hierarchy of parent-child records.

You can use it to retrieve all the top-level items that have no other parent.

```
var topLevelItems = db.children_of(db.root);
-- or
var topLevelItems = db.children_of('root');
```

Note that the root is not stored in the `.index` object, as it is not a "real" data record, just a placeholder for the top of the hierarchy.

### .config

The `.config` property stores the current set of options being used by the database. It's constructed from default settings, overlaid by the settings you pass in when you create the `hier-db` object (if any). See the [Configuration settings](#configuration-settings) section above.

>	**NOTE:** Don't change these values after you start adding items to the database!

## API

Use the following methods to add, remove and retrieve data in the database.

### .add (records, parent)

Adds one or more new records to the database.

- The `records` parameter can be:
  - a single data object that has a `name` field.
  - a string. A new object will be created with that string as its name.
  - an array of the above. Each item is added as a separate new record.
- If the new item already has something in its `parents` property, that value will be kept as-is.
  Otherwise, by default the new item's parent list is set to `['root']` (see `.root` above). You can prevent this by providing a `parent` parameter to specify what record the new record or records should get put under. The `parent` parameter can be either the uid of another record, or the record itself. If you provide a parent that isn't already in the database, the parenting will fail.

### .remove (records, promote_orphans)

Removes one or more records from the database.

- The `records` parameter can be a UID string, the record object itself, or an array of those.
- The `promote_orphans` parameter determines what happens to children of the removed parent. By default, orphaned records are removed along with the parent. Set this to `true` to have the orphans reparented to become children of the removed record's parents.

### .add_parent (child, parent, clear_existing)

Adds a new parent-child relationship between two existing database records. Note that this function fails if either record is not in the database already!

- The `child` parameter is the record you want to reparent.
- The `parent` parameter is the new parent you want for that child record.
- The `clear_existing` parameter determines whether or not any existing parents of the child element should be removed first. If `true`, all existing parents are removed, so the new parent will be the only parent for the child. If `false`, any existing parents are kept, which may result in the child having multiple parents and existing in multiple places in the hierarchy (which may not be what you're expecting). Default value is `false`.

### .remove_parent (child, parent)

Removes the parent-child relationship between the two specified records, if any exists.

### .children_of (record)

Returns the array of all children under the specified record. This function returns the actual data objects, not just the UIDs stored in the `.children` property.

### .parents_of (record)

Returns an array of all parents that own the specified record. This function returns the actual data objects, not just the UIDs stored in the `.parent` property.

### .filter (predicate)

Returns an array of all elements in the database that satisfy the given predicate.

This function is a thin wrapper around the [Lodash .filter function](https://lodash.com/docs/4.17.5#filter), so it accepts any predicate you could use there.

### .find (predicate)

Returns the first element in the database that satisfies the given predicate.

This function is a thin wrapper around the [Lodash .find function](https://lodash.com/docs/4.17.5#find), so it accepts any predicate you could use there.

### .all()

Returns all indexed records as an array.

### .resolve (records)

Returns one or more database records (or the root node) based on their UIDs. Mostly intended for internal use.

The records parameter can be a single string UID, a single object, or an array of strings an objects.

