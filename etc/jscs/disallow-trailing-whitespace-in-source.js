var assert = require("assert");

module.exports = function() {};

module.exports.prototype = {

    configure: function(disallowTrailingWhitespaceInSource) {
        "use strict";

        assert(
            typeof disallowTrailingWhitespaceInSource === "boolean",
            "disallowTrailingWhitespaceInSource option requires boolean value"
        );
        assert(
            disallowTrailingWhitespaceInSource === true,
            "disallowTrailingWhitespaceInSource option requires true value or should be removed"
        );
    },

    getOptionName: function() {
        "use strict";

        return "disallowTrailingWhitespaceInSource";
    },

    check: function(file, errors) {
        "use strict";

        var lines = file.getLines(),
            lineComment = /\/\//,
            startBlockComment = /\/\*(?!.*\*\/)/,
            endBlockComment = /\*\/(?!.*\/\*)/,
            inBlockComment = false;

        for (var i = 0, l = lines.length; i < l; i++) {
            var line = lines[i];

            // Ignore whitespace-only lines
            if (!line.match(/[\S]/)) {
                continue; 
            }

            if (inBlockComment) {
                if (endBlockComment.test(line)) {
                    inBlockComment = false;
                    if (line.match(/\s$/)) {
                        errors.add("Illegal trailing whitespace", i + 1, line.length);        
                    }
                }
            } else if (startBlockComment.test(line)) {
                inBlockComment = true;
            } else if (line.match(/\s$/) && !lineComment.test(line)) {
                errors.add("Illegal trailing whitespace", i + 1, line.length);
            }
        }
    }

};
