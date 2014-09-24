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

    var util = require("util"),
        EventEmitter = require("events").EventEmitter;

    var Q = require("q");

    var Document = require("./dom/document");

    var OPEN_DOCUMENTS_CHANGE_HYSTERESIS = 300,
        ACTIVE_DOCUMENT_CHANGE_HYSTERESIS = 100;

    /**
     * Return the keys for a set as integers.
     * 
     * @private
     * @param {{number: *}} set A set
     * @return {Array.<number>} The keys of the set as integers
     */
    function _intKeys(set) {
        return Object.keys(set).map(function (key) {
            return parseInt(key, 10);
        });
    }

    /**
     * The DocumentManager provides a simple interface for requesting and maintaining
     * up-to-date Document objects from Photoshop.
     * 
     * Emits "openDocumentsChanged" event when the set of open documents changes with
     * the following parameters:
     *      1. @param {Array.<number>} IDs for the set of currently open documents
     *      2. @param {Array.<number>} IDs for the set of recently opened documents
     *      3. @param {Array.<number>} IDs for the set of recently closed documents
     * 
     * Emits "activeDocumentChanged" event when the currently active document changes
     * with the follwing parameter:
     *      1. @param {?number} ID of the currently active document, or null if there is none
     * 
     * @constructor
     * @param {Generator} generator
     * @param {object} config
     * @param {Logger} logger
     */
    function DocumentManager(generator, config, logger) {
        EventEmitter.call(this);
        
        this._generator = generator;
        this._config = config;
        this._logger = logger;

        this._documents = {};
        this._documentDeferreds = {};
        this._documentChanges = {};

        this._openDocumentIds = {};
        this._newOpenDocumentIds = {};
        this._newClosedDocumentIds = {};

        this._initActiveDocumentID();
        this._resetOpenDocumentIDs()
            .then(function () {
                // make sure that openDocumentsChanged fires once on startup, even
                // if there are no open documents
                this._handleOpenDocumentsChange();
            }.bind(this))
            .done();


        generator.onPhotoshopEvent("imageChanged", this._handleImageChanged.bind(this));
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
     * A set of per-document-ID up-to-date Document objects.
     *
     * @private
     * @type {{number: Document}}
     */
    DocumentManager.prototype._documents = null;

    /**
     * A set of per-document-ID deferred objects that indicate Document creation in progress.
     * 
     * @private
     * @type {{number: Deferred}}
     */
    DocumentManager.prototype._documentDeferreds = null;

    /**
     * A set of per-document-ID change queues.
     * 
     * @private
     * @type {{number: Array.<object>}}
     */
    DocumentManager.prototype._documentChanges = null;

    /**
     * A set of document IDs for the currently open documents.
     *
     * @private
     * @type {{number: boolean}}
     */
    DocumentManager.prototype._openDocumentIds = null;

    /**
     * A set of recently opened document IDs.
     *
     * @private
     * @type {{number: boolean}}
     */
    DocumentManager.prototype._newOpenDocumentIds = null;

    /**
     * A set of recently closed document IDs.
     *
     * @private
     * @type {{number: boolean}}
     */
    DocumentManager.prototype._newClosedDocumentIds = null;

    /**
     * If non-null, resolves once the set of open document IDs is finished updating
     *
     * @private
     * @type {?Promise}
     */
    DocumentManager.prototype._openDocumentIdsUpdatingPromise = null;

    /**
     * Whether the set of currently open documents needs to be updated.
     *
     * @private
     * @type {boolean}
     */
    DocumentManager.prototype._openDocumentIdsStale = false;

    /**
     * The ID of the currently active document, or null if there is none.
     *
     * @private
     * @type {?number}
     */
    DocumentManager.prototype._activeDocumentId = null;

    /**
     * Asynchronously create a new Document object using the full document
     * description from Photoshop. 
     * 
     * @private
     * @param {!number} id The ID of the Document to create
     * @return {Promise.<Document>} A promis that resolves with a new Document object for the given ID.
     */
    DocumentManager.prototype._getEntireDocument = function (id) {
        return this._generator.getDocumentInfo(id).then(function (raw) {
            // this._logger.debug(JSON.stringify(raw, null, "  "));
            return new Document(this._generator, this._config, this._logger, raw);
        }.bind(this));
    };

    /**
     * Asynchronously re-initialize the Document object for a given document ID,
     * discarding the previous Document object and clearing the change queue for
     * that ID.
     * 
     * @private
     * @param {!number} id The ID of the Document to re-initialize
     */
    DocumentManager.prototype._resetDocument = function (id) {
        this._documentChanges[id] = [];
        delete this._documents[id];

        this._getEntireDocument(id).done(function (document) {
            // Dispose of this document reference when the document is closed in Photoshop
            document.on("closed", function () {
                delete this._documents[id];
                delete this._documentChanges[id];

                if (this._documentDeferreds.hasOwnProperty(id)) {
                    this._documentDeferreds[id].reject();
                    delete this._documentDeferreds[id];
                }
            }.bind(this));

            this._documents[id] = document;
            this._processNextChange(id);
        }.bind(this), function (err) {
            this._logger.error("Failed to get document:", err);
            this._documentDeferreds[id].reject(err);
        }.bind(this));
    };

    /**
     * Asynchronously initialize a Document object for the given document ID.
     *  
     * @private
     * @param {!number} id The ID of the Document to initialize
     * @return {Promise.<Document>} A promise that resolves with the up-to-date Document
     */
    DocumentManager.prototype._initDocument = function (id) {
        var deferred = Q.defer();

        this._documentDeferreds[id] = deferred;
        this._resetDocument(id);

        return deferred;
    };

    /**
     * For the given document change queue, attempt to apply the next
     * change from the queue to the appropriate Document. If unable to
     * apply the change, re-request the entire document. Otherwise, 
     * continue processing changes from the change queue.
     * 
     * @private
     * @param {!number} id The document ID that indicates the change queue to process
     */
    DocumentManager.prototype._processNextChange = function (id) {
        var document = this._documents[id],
            changes = this._documentChanges[id],
            deferred = this._documentDeferreds[id];

        if (!changes || !deferred) {
            // The document was closed while processing changes
            return;
        }

        if (changes.length === 0) {
            deferred.resolve(document);
            delete this._documentDeferreds[id];
            return;
        }

        var change = changes.shift();

        this._logger.debug("Applying change: ", JSON.stringify(change, null, "  "));
        var success = document._applyChange(change);
        if (!success) {
            this._logger.warn("Unable to apply change to document");
            this._resetDocument(id);
        } else {
            this._processNextChange(id);
        }
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
                this._handleActiveDocumentChange(document.id);
            } else {
                this._handleActiveDocumentChange(null);
            }
        }.bind(this)).fail(function (err) {
            this._logger.warn(err);
            this._handleActiveDocumentChange(null);
        }.bind(this)).done();
    };

    /**
     * Asynchronously reset the set of open document IDs.
     * 
     * Only one instance of this method will execute at a time. Concurrent
     * executions will result in the method running a second time after the
     * first instance has finished.
     * 
     * @private
     * @return {!Promise} Resolves once the set of open document IDs has been
     *      updated.
     */
    DocumentManager.prototype._resetOpenDocumentIDs = function () {
        if (this._openDocumentIdsUpdatingPromise) {
            this._openDocumentIdsStale = true;
            return this._openDocumentIdsUpdatingPromise;
        }

        var promise = this._generator.getOpenDocumentIDs()
            .then(function (ids) {
                var originalIds = Object.keys(this._openDocumentIds);

                ids.forEach(function (id) {
                    if (!this._openDocumentIds.hasOwnProperty(id)) {
                        this._addOpenDocumentID(id);
                    }
                }, this);

                var newIds = ids.reduce(function (ids, id) {
                    ids[id] = true;
                    return ids;
                }, {});
                
                originalIds.forEach(function (id) {
                    if (!newIds.hasOwnProperty(id)) {
                        this._removeOpenDocumentID(id);
                    }
                }, this);

                // In the case that there is an additional pending call to _resetOpenDocumentIDs,
                // then we will re-call this function synchronously below. In order to
                // not hit the early return, we need to clear the variable holding a reference to 
                // the orignal promise. (Or, in the normal case, this is just cleaning up after
                // ourselves.)
                this._openDocumentIdsUpdatingPromise = null;

                if (this._openDocumentIdsStale) {
                    this._openDocumentIdsStale = false;

                    // Returning a new promise in this "then" handler has the effect of not resolving
                    // the original promise until we're done with the next update.
                    return this._resetOpenDocumentIDs();
                }
            }.bind(this));

        this._openDocumentIdsUpdatingPromise = promise;

        return promise;
    };

    /**
     * Emits an "openDocumentsChanged" changed event that includes the currently
     * open set of document IDs, along with recently opened and closed documentIDs.
     *
     * @private
     */
    DocumentManager.prototype._handleOpenDocumentsChange = function () {
        if (this._openDocumentsChangeTimer) {
            return;
        }

        this._openDocumentsChangeTimer = setTimeout(function () {
            var allOpenDocumentIds = _intKeys(this._openDocumentIds),
                nowOpenDocumentIds = _intKeys(this._newOpenDocumentIds),
                nowClosedDocumentIds = _intKeys(this._newClosedDocumentIds);

            this._newOpenDocumentIds = {};
            this._newClosedDocumentIds = {};
            this._openDocumentsChangeTimer = null;

            this.emit("openDocumentsChanged", allOpenDocumentIds, nowOpenDocumentIds, nowClosedDocumentIds);
        }.bind(this), OPEN_DOCUMENTS_CHANGE_HYSTERESIS);
    };

    /**
     * Add the given document ID from the set of currently open documents.
     *
     * @private
     * @param {number} id
     */
    DocumentManager.prototype._addOpenDocumentID = function (id) {
        if (this._openDocumentIds.hasOwnProperty(id)) {
            return;
        }

        this._openDocumentIds[id] = true;
        this._newOpenDocumentIds[id] = true;
        delete this._newClosedDocumentIds[id];
        this._handleOpenDocumentsChange();
    };

    /**
     * Remove the given document ID from the set of currently open documents.
     *
     * @private
     * @param {number} id
     */
    DocumentManager.prototype._removeOpenDocumentID = function (id) {
        if (id === this._activeDocumentId) {
            this._handleActiveDocumentChange(null);
        }

        if (!this._openDocumentIds.hasOwnProperty(id)) {
            return;
        }

        delete this._openDocumentIds[id];
        this._newClosedDocumentIds[id] = true;
        delete this._newOpenDocumentIds[id];
        this._handleOpenDocumentsChange();
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
    DocumentManager.prototype._handleActiveDocumentChange = function (id) {
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
     * Handler for Photoshop's imageChanged event. Accepts a raw change description object
     * and, if the change is intended for an extant Document object, updates that object
     * accordingly. Ignores changes for document IDs for which getDocument has not been
     * called. The imageChanged events are also used to maintain the current set of open
     * documents as well as the current active document.
     * 
     * @private
     * @param {object} change A raw change description object
     */
    DocumentManager.prototype._handleImageChanged = function (change) {
        if (!change.hasOwnProperty("id")) {
            this._logger.warn("Received change for unknown document:", change);
            return;
        }

        var id = change.id;

        // Update the active document and the set of open documents
        if (change.active) {
            this._resetOpenDocumentIDs().done();
            this._handleActiveDocumentChange(id);
        } else if (change.closed) {
            this._removeOpenDocumentID(id);
        } else {
            this._addOpenDocumentID(id);
        }

        // ignore changes for document IDs until a client calls getDocument
        if (!this._documentDeferreds.hasOwnProperty(id) && !this._documents.hasOwnProperty(id)) {
            return;
        }

        if (!this._documentChanges.hasOwnProperty(id)) {
            this._documentChanges[id] = [];
        }

        var changes = this._documentChanges[id],
            pendingChanges = changes.push(change);

        if (pendingChanges === 1 && !this._documentDeferreds.hasOwnProperty(id)) {
            if (this._documents.hasOwnProperty(id)) {
                this._documentDeferreds[id] = Q.defer();
                this._processNextChange(id);
            } else {
                this._initDocument(id);
            }
        }
    };

    /**
     * Asynchonously request an up-to-date Document object for the given document ID.
     *
     * @param {!number} id The document ID
     * @return {Promise.<Document>} A promise that resoves with a Document object for the given ID
     */
    DocumentManager.prototype.getDocument = function (id) {
        // We're in the process of updating the document; return that when it's ready
        if (this._documentDeferreds.hasOwnProperty(id)) {
            return this._documentDeferreds[id].promise;
        }

        // We have a document and we aren't updating it; return it immediately
        if (this._documents.hasOwnProperty(id)) {
            return Q.resolve(this._documents[id]);
        }

        // We don't know anything about this document; fetch it from Photoshop
        var deferred = this._initDocument(id);
        deferred.promise.fail(function () {
            this._removeOpenDocumentID(id);
        }.bind(this));
        return deferred.promise;
    };

    /**
     * Get the ID of the currently active document, or null if there isn't one. 
     * 
     * @return {?number] ID of the currently active document.
     */
    DocumentManager.prototype.getActiveDocumentID = function () {
        return this._activeDocumentId;
    };

    /**
     * Asynchonously request an up-to-date Document object for the currently
     * active document. 
     *
     * @see DocumentManager.prototype.getDocument
     * @see DocumentManager.prototype.getActiveDocumentID
     * @return {Promise.<Document>} A promise that resoves with a Document object
     *      for the currently active document, or rejects if there is none.
     */
    DocumentManager.prototype.getActiveDocument = function () {
        if (this._activeDocumentId) {
            return this.getDocument(this._activeDocumentId);
        } else {
            return Q.reject();
        }
    };

    /**
     * Get the IDs of the currently open documents.
     * 
     * @return {Array.<number>} IDs of the currently open documents
     */
    DocumentManager.prototype.getOpenDocumentIDs = function () {
        return _intKeys(this._openDocumentIds);
    };

    module.exports = DocumentManager;
}());
