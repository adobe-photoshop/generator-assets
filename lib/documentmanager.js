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
        EventEmitter = require("events").EventEmitter,
        Q = require("q"),
        Document = require("./document");

    function DocumentManager(generator) {
        this._generator = generator;
        this._documents = {};
        this._documentDeferreds = {};
        this._documentChanges = {};

        generator.onPhotoshopEvent("imageChanged", this._handleImageChanged.bind(this));
    }

    util.inherits(DocumentManager, EventEmitter);

    DocumentManager.prototype._generator = null;

    DocumentManager.prototype._documents = null;

    DocumentManager.prototype._documentDeferreds = null;

    DocumentManager.prototype._documentChanges = null;

    DocumentManager.prototype._getEntireDocument = function (id) {
        return this._generator.getDocumentInfo(id).then(function (raw) {
            // console.log(JSON.stringify(raw, null, "  "));
            return new Document(this._generator, raw);
        }.bind(this));
    };

    DocumentManager.prototype._resetDocument = function (id) {
        this._documentChanges[id] = [];

        this._getEntireDocument(id).done(function (document) {
            this._documents[id] = document;
            this._processNextChange(id);
        }.bind(this), function (err) {
            console.error("Failed to get document:", err.stack);
            this._documentDeferreds[id].reject(err);
        }.bind(this));
    };

    DocumentManager.prototype._initDocument = function (id) {
        var deferred = Q.defer();

        this._documentDeferreds[id] = deferred;
        this._resetDocument(id);

        return deferred;
    };

    DocumentManager.prototype._processNextChange = function (id) {
        var document = this._documents[id],
            changes = this._documentChanges[id],
            deferred = this._documentDeferreds[id];

        if (changes.length === 0) {
            deferred.resolve(document);
            delete this._documentDeferreds[id];
            return;
        }

        var change = changes.shift();
        try {
            console.log("Applying change: ", JSON.stringify(change, null, "  "));
            document._applyChange(change);
        } catch (err) {
            console.warn("Unable to apply change to document:", err.stack);
            this._resetDocument(id);
            return;
        }

        if (document.closed) {
            if (changes.length > 0) {
                this._resetDocument(id);
            } else {
                deferred.reject();
            }
        } else {
            this._processNextChange(id);
        }
    };

    DocumentManager.prototype._handleImageChanged = function (change) {
        var id = change.id;
        if (!id) {
            console.warn("Received change for unknown document:", change);
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

    DocumentManager.prototype.getDocument = function (id) {
        // We're in the process of updating the document; return that when it's ready
        if (this._documentDeferreds.hasOwnProperty(id)) {
            return this._documentDeferreds[id].promise;
        }

        // We have a document and we aren't updating it; return it immediately
        if (this._documents.hasOwnProperty(id)) {
            return new Q(this._documents[id]);
        }

        // We don't know anything about this document; fetch it from Photoshop
        var deferred = this._initDocument(id);

        return deferred.promise;
    };

    module.exports = DocumentManager;
}());