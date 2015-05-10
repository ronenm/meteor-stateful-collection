_.extend(FSM.prototype, {
  initializeMethods: function(options) {       
    if (options.generateStubs) {     
      var legelTransition = _.select(_.keys(this.transitionsDefs), function(key) {
        return this[key].permission;
      },this.transitionsDefs);
      
      var transitions = _.pick(this.transitionsDefs,legelTransition);
      
      var methods = {};
      var self = this;
      _.each(transitions, function(record,transition) {
        console.log("Initializing method: ",this.methodName(transition));
        methods[this.methodName(transition)] = function(docId,parameters) {
          var doc = self.collection.findOne(docId);
          doc.executeTransition(this.usedId,transition,parameters);
          return doc.afterTransition(this.userId,transition,parameters);
        }
      }, this);
      
      Meteor.methods(methods);
    }
  }
});

_.extend(StatefullCollectionInstance.prototype,{
  remoteTransition: function(transition,parameters,callback) {
    if (!parameters) {
      parameters = {};
    }
    var userId = Meteor.userId()
    if (this.beforeTransition(userId,transition,parameters)) {
      this.check(userId,transition,parameters);
      Meteor.call(this.fsm.methodName(transition),this._id,parameters,callback);
    } else {
      throw new Meteor.Error("illegal-transition","Prerequistic for transition " + transition + " have failed!");
    }
  }
});