(function () {
    "use strict";

    /**
     * Call reportError for any problems with the file name.
     * The results are independent of the platform we're running on because
     * the PSD files should be portable across operation systems.
     * @param {!String} fileName The file name to validate
     * @param {function(String)} reportError A function to call to report an error
     */
    function validateFileName(fileName, reportError) {
        var invalidCharacters = /[\=<>\:\"\/\\\|\?\*\0]/,
            match;

        if (Boolean(match = fileName.match(invalidCharacters))) {
            reportError("File name contains invalid character " + JSON.stringify(match[0]));
            return false;
        }

        return true;
    }

    exports.validateFileName = validateFileName;
}());
    