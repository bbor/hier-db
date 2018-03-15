
var assert = require('assert');

var _ = require('lodash');

/*
  name, uid, children, and parent are the data fields used for those items in all database records.
  Change these when you construct the db if you want your records to be able to store your own data in
  fields with these default names.
*/
var defaults = {
  name: 'name',
  uid: 'uid',
  children: 'children',
  parents: 'parents',
  disambiguate_by: ['type'],        // When two records have the same name, we'll use these fields to help construct a unique uid.
}

/*
  Constructs a new db.
  The config is an optional object that overrides one or more configuration values.
*/
function db (config) {
  if (!(this instanceof db)) return new db(config);
  this.config = _.merge({}, defaults, config);
  this.root = {};
  this.root[this.config.uid] = 'root';
  this.root[this.config.children] = [];
  this.index = Object.create(null);
}

/*
  Generates a new UID that is globally unique within the database, based on the name passed
  in and the optional array of disambiguation strings. Used internally by add(). If the name is
  unique, it's used as-is. If the name is already used, each disambiguation value is appended in turn
  until it does become unique. If even that fails, a numeric suffix is appended.
*/
db.prototype.generate_uid = function(name, types){
  function alphafy (str) { return str.replace(/\W/g,'_'); }
  var uid = alphafy(name);
  if (!this.index[uid]) {
    return uid;
  }
  if (types) {
    for (var i_type = 0; i_type < types.length; i_type++)
    {
      uid = uid + '_' + alphafy(types[i_type]);
      if (!this.index[uid]) {
        return uid;
      }
    }
  }
  var disambig = 1;
  var testuid = uid + '_' + disambig;
  if (this.index[testuid]) {
    while (this.index[testuid]) {
      disambig++;
      testuid = uid + '_' + disambig;
    }
    uid = testuid;
  }
  else {
    uid = testuid;
  }
  return uid;
 };


/*
  Adds one or more new records to the database.
  The records parameter can be:
  - a single data object that has a `name` field.
  - a string. A new object will be created with that string as its name.
  - an array of such data objects. Each is added as a new record.
  If you provide a parent, the new record or records will get added under that parent.
  The parent parameter can be either the uid of another record, or the record itself.
  If you provide a parent that isn't already in the database, the parenting will fail.
  Any parent or children that are already present in each record are kept.
  */
db.prototype.add = function(records, parent)
{
  if (!records) return;
  if (typeof(records) === 'string')
  {
    records = {};
    records[this.config.name] = records;
  }
  if (!Array.isArray(records))
  {
    records = [records];
  }
  for (var i_record = 0; i_record < records.length; i_record++)
  {
    var record = records[i_record];
    assert(record[this.config.name], 'This record needs a name! ' + record);
    if (!record[this.config.uid] || this.index[record[this.config.uid]] || record[this.config.uid] == 'root') {
      record[this.config.uid] = this.generate_uid(record[this.config.name], _(record).pick(this.config.disambiguate_by).values().value());
    }
    record[this.config.children] = record[this.config.children] || [];
    record[this.config.parents] = record[this.config.parents] || [];
    this.index[record[this.config.uid]] = record;
    parent = parent || 'root';
    this.add_parent(record, parent);
  }
}

/*
  Removes one or more records from the database.
  Record can be a UID or the record itself.
  The promote_orphans parameter determines what happens to children of the removed parent.
  By default, orphaned records are removed along with the parent. Set this to *true* to have
  the orphans reparented to the parent of the removed record.
*/
db.prototype.remove = function(records, promote_orphans)
{
  if (!records) return;
  if (!Array.isArray(records))
  {
    records = [records];
  }
  for (var i_record = 0; i_record < records.length; i_record++)
  {
    var record = this.resolve(records[i_record]);
    var uid = record[this.config.uid];
    // visit parents and remove
    var parents = this.resolve(record[this.config.parents]);
    parents.forEach( function(parent) {
      parent[this.config.children] = _.pull(parent[this.config.children], record[this.config.uid]);
    }.bind(this) );

    // visit each child and either remove or replace with grandparent
    var children = this.children_of(record);
    if (promote_orphans) {
      children.forEach( function(child) {
        parents.forEach( function(parent) {
          this.add_parent(child, parent, true); 
        }.bind(this) );
      }.bind(this) );
    }
    else {
      children.forEach( function(child) { this.remove(child, false); }.bind(this) );
    }
    // finally, remove record from index
    delete this.index[uid];
  }
}

/*
  Adds a new parent-child relationship between two existing database records.
  Note that this function fails if either record is not in the database already!
  The child parameter is the record you want to reparent.
  The parent parameter is the new parent you want for that child record.
  The clear_existing parameter determines whether or not any existing parents of the child element should be kept.
*/
db.prototype.add_parent = function(child, parent, clear_existing)
{
  var o_parent = this.resolve(parent);
  var o_child = this.resolve(child);
  if (!o_parent || !o_child) return;

  if (clear_existing)
  {
    var ex_parents = this.resolve(o_child[this.config.parents]);
    ex_parents.forEach( function(ex_parent) {
      ex_parent[this.config.children] = _.pull(ex_parent[this.config.children], o_child[this.config.uid]);
    }.bind(this) );
    o_child[this.config.parents] = [];
  }

  o_parent[this.config.children] = _.union(o_parent[this.config.children], [o_child[this.config.uid]]);
  o_child[this.config.parents] = _.union(o_child[this.config.parents], [o_parent[this.config.uid]]);
}

/*
  Removes the parent-child relationship between the two specified records.
*/
db.prototype.remove_parent = function(child, parent)
{
  var o_parent = this.resolve(parent);
  var o_child = this.resolve(child);
  if (!o_parent || !o_child) return;
  
  o_parent[this.config.children] = _.pull(o_parent[this.config.children], o_child[this.config.uid]);
  o_child[this.config.parents] = _.pull(o_child[this.config.parents], o_parent[this.config.uid]);
}

/*
  Returns one or more database records based on their UIDs.
  The records parameter can be a single string UID, a single object, or an array of those.
*/
db.prototype.resolve = function(records)
{
  var array_mode = true;
  if (!records) return [];
  if (!Array.isArray(records)) {
    records = [records];
    array_mode = false;
  }
  var out_records = [];
  records.forEach(function(record) {
    if (record === this.root || record === 'root')
    {
      out_records.push(this.root);
    }
    else if (typeof(record) === 'string')
    {
      out_records.push(this.index[record]);
    }
    else if (typeof(record) === 'object')
    {
      if (record[this.config.uid] && this.index[record[this.config.uid]])
      {
        out_records.push(record);
      }
    }
  }.bind(this));
  return (array_mode) ? out_records : out_records[0];
}

/*
  Returns the array of children under the specified record, first resolving them from
  their UIDs.
*/
db.prototype.children_of = function(record)
{
  var o_record = this.resolve(record);
  if (!o_record) return [];
  return this.resolve(o_record[this.config.children]);
}

/*
  Returns the array of parents that own the specified record, first resolving them from
  their UIDs.
*/
db.prototype.parents_of = function(record)
{
  var o_record = this.resolve(record);
  if (!o_record) return [];
  return this.resolve(o_record[this.config.parents]);
}

/*
  Returns an array of all elements in the database that satisfy the given predicate.
*/
db.prototype.filter = function(predicate)
{
  return _.filter(this.index, predicate);
}

/*
  Returns the first element in the database that satisfies the given predicate.
*/
db.prototype.find = function(predicate)
{
  return _.find(this.index, predicate);
}

/*
  Returns all indexed records as an array.
*/
db.prototype.all = function()
{
  return Object.values(this.index);
}

module.exports = db;
