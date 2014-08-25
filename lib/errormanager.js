/*
 * Copyright (c) 2014 Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

(function () {
    "use strict";

    var ERRORS_FILE = "errors.txt";

    /**
     * Manage a collection of user-reportable errors, each associated with a
     * particular layer.
     *
     * @constructor
     * @param {Generator} generator
     * @param {object} config
     * @param {Logger} logger
     * @param {FileManager} fileManager
     */
    function ErrorManager(generator, config, logger, fileManager) {
        this._generator = generator;
        this._config = config;
        this._logger = logger;

        this._fileManager = fileManager;

        this._errors = {};
        this._errorsAdded = {};
        this._errorsRemoved = false;
    }

    /**
     * Add a single user-reportable error for the given layer.
     * 
     * @param {objec} namedComponent a component with .name and .id fields
     * @param {object} err
     * @param {String} typeName
     */
    ErrorManager.prototype.addError = function (namedComponent, err, typeName) {
        var datetime = new Date().toLocaleString(),
            message;
        
        typeName = typeName || "Layer";
        message = "[" + datetime + "] " + typeName + " \"" + namedComponent.name + "\": " + err + "\n";

        if (!this._errors.hasOwnProperty(namedComponent.id)) {
            this._errors[namedComponent.id] = [];
        }

        this._errors[namedComponent.id].push(message);
        this._errorsAdded[namedComponent.id] = true;
    };

    /**
     * Remove all user-reportable errors for layer indicated by the given layerId.
     *
     * @param {number} id layer or layerComp Id
     */
    ErrorManager.prototype.removeErrors = function (id) {
        if (this._errors.hasOwnProperty(id)) {
            delete this._errors[id];
            this._errorsRemoved = true;
        }
    };

    /**
     * Remove all user-reportable errors for all layers. Even if there are no errors,
     * calling this method will force all errors to be re-written when errors are
     * reported next.
     * 
     * @see ErrorManager.prototype.reportErrors
     */
    ErrorManager.prototype.removeAllErrors = function () {
        this._errors = {};
        this._errorsRemoved = true;
    };

    /**
     * Get a string containing all the errors for the layers indicated by the given
     * list of layerIds.
     * 
     * @private
     * @param {Array.<number>} layerIds
     * @return {string}
     */
    ErrorManager.prototype._getErrorString = function (layerIds) {
        return layerIds.reduce(function (allMessages, layerId) {
            var errorMessages = this._errors[layerId],
                combinedMessage = errorMessages.join("");

            return allMessages + combinedMessage;
        }.bind(this), "");
    };

    /**
     * Update the errors.txt file on disk according to the current set of errors.
     */
    ErrorManager.prototype.reportErrors = function () {
        var layerIdsWithErrors,
            errorString;

        function _getSortedKeys(set) {
            return Object.keys(set)
                .map(function (key) {
                    return parseInt(key, 10);
                })
                .sort();
        }

        if (this._errorsRemoved) {
            layerIdsWithErrors = _getSortedKeys(this._errors);
            if (layerIdsWithErrors.length > 0) {
                errorString = this._getErrorString(layerIdsWithErrors);
                this._fileManager.writeFileWithin(ERRORS_FILE, errorString);
            } else {
                this._fileManager.removeFileWithin(ERRORS_FILE);
            }
        } else {
            layerIdsWithErrors = _getSortedKeys(this._errorsAdded);
            if (layerIdsWithErrors.length > 0) {
                errorString = this._getErrorString(layerIdsWithErrors);
                this._fileManager.appendFileWithin(ERRORS_FILE, errorString);
            }
        }

        this._errorsRemoved = false;
        this._errorsAdded = {};
    };


    module.exports = ErrorManager;
}());
