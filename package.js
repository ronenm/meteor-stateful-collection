Package.describe({
  name: 'ronenm:statefull-collection',
  version: '0.0.1',
  // Brief, one-line summary of the package.
  summary: "A practical FSM support for Meteor's Mongo collection",
  // URL to the Git repository containing the source code for this package.
  git: 'https://github.com/ronenm/meteor-stateful-collection.git',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.0.3.1');
  api.use("underscore");
  api.use("mongo");
  api.use("minimongo");
  api.addFiles('lib/common.js');
  api.addFiles('lib/server.js','server');
  api.addFiles('lib/client.js','client');
  api.export('StatefullCollection');
  api.export('ArrayLengthMatch'); // This is just a goody! It allow checking for array length!
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('ronenm:statefull-collection');
  api.addFiles('ronenm:statefull-collection-tests.js');
});
