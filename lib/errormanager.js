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
     * Manage a collection of user-reportable errors, each associated with a paricular source object (layer, layer comp,
     * or document)
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
     * Possible source object types.
     */
    ErrorManager.prototype.LAYER = "layer";
    ErrorManager.prototype.LAYER_COMP = "layer-comp";
    ErrorManager.prototype.DOCUMENT = "document";
    ErrorManager.prototype.UNKNOWN = "unknown";

    /**
     * Add a single user-reportable error for the given layer.
     * 
     * @param {object} sourceObject An object representing a layer, layer comp, or document related to the error. Should
     *      have .name and .id fields
     * @param {object} err
     * @param {string} [optionalType] The type of the source object (e.g. ErrorManager.LAYER). Default is LAYER.
     */
    ErrorManager.prototype.addError = function (sourceObject, err, optionalType) {
        var type = optionalType || this.LAYER,
            datetime = new Date().toLocaleString(),
            message = "[" + datetime + "] " + type + " \"" + sourceObject.name + "\": " + err + "\n",
            uniqueId = this._getUniqueId(type, sourceObject.id);

        if (!this._errors.hasOwnProperty(uniqueId)) {
            this._errors[uniqueId] = [];
        }

        this._errors[uniqueId].push(message);
        this._errorsAdded[uniqueId] = true;
    };

    /**
     * Add a single user-reportable error for the given component's source object (layer, comp, or document).
     * 
     * @param {object} component
     * @param {object} err
     */
    ErrorManager.prototype.addErrorForComponent = function (component, err) {
        var params = this._componentToSourceObjectAndType(component);
        this.addError(params.sourceObject, err, params.type);
    };

    /**
     * Returns the errors for the component.
     *
     * @param {Component} component
     * @return {Array.<string>} The errors for the source object.
     */
    ErrorManager.prototype.getErrorsForComponent = function (component) {
        var params = this._componentToSourceObjectAndType(component),
            uniqueId = this._getUniqueId(params.type, params.sourceObject.id);
        return this._errors[uniqueId];
    };

    /**
     * Remove all user-reportable errors for the source object.
     *
     * @param {number} sourceObjectId
     * @param {string} [optionalType] The type of the source object (e.g. ErrorManager.LAYER). Default is LAYER.
     */
    ErrorManager.prototype.removeErrors = function (sourceObjectId, optionalType) {
        var type = optionalType || this.LAYER,
            uniqueId = this._getUniqueId(type, sourceObjectId);

        if (this._errors.hasOwnProperty(uniqueId)) {
            delete this._errors[uniqueId];
            this._errorsRemoved = true;
        }
    };

    /**
     * Remove all user-reportable errors for the component.
     *
     * @param {Component} component
     */
    ErrorManager.prototype.removeErrorsForComponent = function (component) {
        var params = this._componentToSourceObjectAndType(component);
        this.removeErrors(params.sourceObject.id, params.type);
    };

    /**
     * Remove all user-reportable errors for all source objects. Even if there are no errors, calling this method will
     * force all errors to be re-written when errors are reported next.
     * 
     * @see ErrorManager.prototype.reportErrors
     */
    ErrorManager.prototype.removeAllErrors = function () {
        this._errors = {};
        this._errorsRemoved = true;
    };

    /**
     * Returns a unique id for a source object like a layer, layer comp, or document. This makes sure different source
     * object ids don't conflict. A document with id 13 may get a unique id of "document-13", while a layer with id 13
     * may get a unique of "layer-13".
     *
     * @param {string} type The type of the source object (e.g. ErrorManager.LAYER).
     * @param {number} sourceObjectId An id of a source object like a layer, layer comp, or document.
     * @return {string} A unique id.
     */
    ErrorManager.prototype._getUniqueId = function (type, sourceObjectId) {
        return [type, sourceObjectId].join("-");
    };

    /**
     * Returns the source object associated with a component and its type (e.g. ErrorManager.LAYER).
     *
     * @param {Component} component
     * @return {Object} An object with sourceObject and type properties.
     */
    ErrorManager.prototype._componentToSourceObjectAndType = function (component) {
        if (component) {
            if (component.layer) {
                return { sourceObject: component.layer, type: this.LAYER };
            } else if (component.comp) {
                return { sourceObject: component.comp, type: this.LAYER_COMP };
            } else if (component.document) {
                return { sourceObject: component.document, type: this.DOCUMENT };
            }
        }

        return {
            sourceObject: { id: 0, name: this.UNKNOWN },
            type: this.UNKNOWN
        };
    };

    /**
     * Get a string containing all the errors for the source objects indicated by the given list of unique ids.
     * 
     * @private
     * @param {Array.<number>} uniqueIds
     * @return {string}
     */
    ErrorManager.prototype._getErrorString = function (uniqueIds) {
        return uniqueIds.reduce(function (allMessages, uniqueId) {
            var errorMessages = this._errors[uniqueId],
                combinedMessage = errorMessages.join("");

            return allMessages + combinedMessage;
        }.bind(this), "");
    };

    /**
     * Update the errors.txt file on disk according to the current set of errors.
     */
    ErrorManager.prototype.reportErrors = function () {
        var uniqueIdsWithErrors,
            errorString;

        function _getSortedKeys(set) {
            return Object.keys(set)
                .sort();
        }

        if (this._errorsRemoved) {
            uniqueIdsWithErrors = _getSortedKeys(this._errors);
            if (uniqueIdsWithErrors.length > 0) {
                errorString = this._getErrorString(uniqueIdsWithErrors);
                this._fileManager.writeFileWithin(ERRORS_FILE, errorString);
            } else {
                this._fileManager.removeFileWithin(ERRORS_FILE);
            }
        } else {
            uniqueIdsWithErrors = _getSortedKeys(this._errorsAdded);
            if (uniqueIdsWithErrors.length > 0) {
                errorString = this._getErrorString(uniqueIdsWithErrors);
                this._fileManager.appendFileWithin(ERRORS_FILE, errorString);
            }
        }

        this._errorsRemoved = false;
        this._errorsAdded = {};
    };


    module.exports = ErrorManager;
}());
