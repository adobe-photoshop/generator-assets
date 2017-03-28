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

/* jshint newcap: false */

(function () {
    "use strict";

    var util = require("util"),
        EventEmitter = require("events").EventEmitter;

    var Q = require("q");

    var Document = require("./dom/document");

    var ACTIVE_DOCUMENT_CHANGE_HYSTERESIS = 100;

    /**
     * The DocumentManager provides a simple interface maintaining the currently active document,
     * and provides a method to retrieve an up-to-date Document object from Photoshop.

     * Emits "activeDocumentChanged" event when the currently active document changes
     * with the follwing parameter:
     *      1. @param {?number} ID of the currently active document, or null if there is none
     *
     * @constructor
     * @param {Generator} generator
     * @param {object} config
     * @param {Logger} logger
     * @param {object*} options, runtime options:
     *                    getDocumentInfoFlags: object, key documented at getDocumentInfo
     *                    clearCacheOnChange: bool, removes the document from the cache on
     *                          change instead of updating it and sending a change event
     */
    function DocumentManager(generator, config, logger, options) {
        EventEmitter.call(this);
        
        this._generator = generator;
        this._config = config;
        this._logger = logger;

        options = options || {};
        this._getDocumentInfoFlags = options.getDocumentInfoFlags;
        // this._clearCacheOnChange = options.clearCacheOnChange;

        // TODO abort generation if document closes, somewhere

        this._initActiveDocumentID();

        this._handleCurrentDocumentChanged = this._handleCurrentDocumentChanged.bind(this);
        this._handleClosedDocument = this._handleClosedDocument.bind(this);
        generator.onPhotoshopEvent("currentDocumentChanged", this._handleCurrentDocumentChanged);
        generator.onPhotoshopEvent("closedDocument", this._handleClosedDocument);
    }

    util.inherits(DocumentManager, EventEmitter);

    /**
     * The Generator instance.
     * 
     * @private
     * @type {Generator}
     */
    DocumentManager.prototype._generator = null;

    /**
     * The ID of the currently active document, or null if there is none.
     *
     * @private
     * @type {?number}
     */
    DocumentManager.prototype._activeDocumentId = null;

    /**
     * Flags to pass into the main call to getDocumentInfo
     *
     * @private
     * @type {object}
     */
    DocumentManager.prototype._getDocumentInfoFlags = null;

    /**
     * Asynchronously create a new Document object using the full document
     * description from Photoshop. 
     * 
     * @private
     * @param {!number} id The ID of the Document to create
     * @return {Promise.<Document>} A promis that resolves with a new Document object for the given ID.
     */
    DocumentManager.prototype._getEntireDocument = function (id) {
        return this._generator.getDocumentInfo(id, this._getDocumentInfoFlags).then(function (raw) {
            return new Document(this._generator, this._config, this._logger, raw);
        }.bind(this));
    };
    
    /**
     * Asynchronously initialize the current active document ID.
     *
     * @private
     */
    DocumentManager.prototype._initActiveDocumentID = function () {
        this._generator.getDocumentInfo(undefined, {
            compInfo:           false,
            imageInfo:          false,
            layerInfo:          false,
            expandSmartObjects: false,
            getTextStyles:      false,
            selectedLayers:     false,
            getCompSettings:    false
        }).then(function (document) {
            if (document) {
                this._setActiveDocument(document.id);
            } else {
                this._setActiveDocument(null);
            }
        }.bind(this)).fail(function (err) {
            this._logger.warn(err);
            this._setActiveDocument(null);
        }.bind(this)).done();
    };

    /**
     * Asynchronously emits an "activeDocumentChanged" event when the currently
     * active document changes. If there is a currently active document, that
     * document's ID is included with the the "activeDocumentChanged" event;
     * otherwise the parameter is null.
     * 
     * @private
     * @param {?number} id
     */
    DocumentManager.prototype._setActiveDocument = function (id) {
        this._activeDocumentId = id;

        if (this._activeDocumentChangeTimer) {
            return;
        }

        this._activeDocumentChangeTimer = setTimeout(function () {
            this._activeDocumentChangeTimer = null;

            this.emit("activeDocumentChanged", this._activeDocumentId);
        }.bind(this), ACTIVE_DOCUMENT_CHANGE_HYSTERESIS);
    };

    /**
     * Handler for Photoshop's currentDocumentChanged event
     *
     * @private
     * @param {number} id document ID
     */
    DocumentManager.prototype._handleCurrentDocumentChanged = function (id) {
        // It is not expected that this event will be called without an ID,
        // but if does we will log an error and fall back on a separate photoshop call to get
        // the active document (or validate that no document is open) with _initActiveDocumentID
        if (!Number.isInteger(id)) {
            this._logger.error("CurrentDocumentChanged event provided invalid document id:", id);
            this._initActiveDocumentID();
            return;
        }

        this._setActiveDocument(id);
    };

    /**
     * Handler for Photoshop's closeDocument event
     *
     * @private
     * @param {number} id document ID
     */
    DocumentManager.prototype._handleClosedDocument = function (id) {
        if (!Number.isInteger(id)) {
            throw new Error("closeDocument event provided invalid document id: " + id);
        }

        this.emit("documentClosed", id);
    };

    /**
     * Asynchronously request an up-to-date Document object for the given document ID.
     *
     * @param {!number} id The document ID
     * @return {Promise.<Document>} A promise that resolves with a Document object for the given ID
     */
    DocumentManager.prototype.getDocument = function (id) {
        return this._getEntireDocument(id)
            .catch(function (err) {
                throw new Eror("DocumentManager Failed to getDocument: " + id, err);
            });
    };

    /**
     * Get the ID of the currently active document, or null if there isn't one. 
     * 
     * @return {?number} ID of the currently active document.
     */
    DocumentManager.prototype.getActiveDocumentID = function () {
        return this._activeDocumentId;
    };

    /**
     * Asynchronously request an up-to-date Document object for the currently
     * active document. 
     *
     * @see DocumentManager.prototype.getDocument
     * @see DocumentManager.prototype.getActiveDocumentID
     * @return {Promise.<Document>} A promise that resolves with a Document object
     *      for the currently active document, or rejects if there is none.
     */
    DocumentManager.prototype.getActiveDocument = function () {
        if (this._activeDocumentId) {
            return this.getDocument(this._activeDocumentId);
        } else {
            return Q.reject();
        }
    };

    module.exports = DocumentManager;
}());
