const NodeUuid = require('node-uuid');

module.exports = {
    uuid: function() {
        return NodeUuid.v4();
    },

    prettyJson: function(obj) {
        return JSON.stringify(obj, null, 4);
    }
};
