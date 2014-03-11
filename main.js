/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
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

    var DocumentManager = require("./lib/documentmanager"),
        StateManager = require("./lib/statemanager"),
        RenderManager = require("./lib/rendermanager");

    var Q = require("q");

    var _documentManager,
        _stateManager,
        _renderManager;

    var _activeDocuments = {};

    var _waitingDocuments = {};

    function init(generator) {
        _documentManager = new DocumentManager(generator);
        _stateManager = new StateManager(generator);
        _renderManager = new RenderManager(generator);

        _stateManager.on("active", function (id) {
            if (_waitingDocuments.hasOwnProperty(id) || _activeDocuments.hasOwnProperty(id)) {
                return;
            }

            var documentPromise = _documentManager.getDocument(id);
            
            _waitingDocuments[id] = documentPromise;

            documentPromise.done(function (document) {
                delete _waitingDocuments[id];
                _activeDocuments[id] = document;

                _renderManager.renderDocument(document).done(function () {
                    document.on("change", function (change) {
                        _renderManager.renderChange(change);
                    });
                });
            });
        });

        _stateManager.on("inactive", function (id) {
            var documentPromise = _waitingDocuments[id];
            if (!documentPromise) {
                documentPromise = new Q(_activeDocuments[id]);
            }

            documentPromise.done(function (document) {
                if (document) {
                    document.off("change");
                    delete _activeDocuments[id];
                }
            });
        });
    }

    exports.init = init;
}());
