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
        // AssetManager = require("./lib/assetmanager");

    var _documentManager,
        _stateManager;

    var _renderManagers = {};
        // _assetManagers = {};

    var _waitingDocuments = {},
        _canceledDocuments = {};

    function init(generator) {
        _documentManager = new DocumentManager(generator);
        _stateManager = new StateManager(generator);

        _stateManager.on("active", function (id) {
            if (_waitingDocuments.hasOwnProperty(id)) {
                return;
            }

            var documentPromise = _documentManager.getDocument(id);
            
            _waitingDocuments[id] = documentPromise;

            documentPromise.done(function (document) {
                delete _waitingDocuments[id];

                if (_canceledDocuments.hasOwnProperty(id)) {
                    delete _canceledDocuments[id];
                } else {
                    _renderManagers[id] = new RenderManager(generator, document);
                    // _assetManagers[id] = new AssetManager(generator, document);

                    // _renderManagers[id].on("add", function (id, source, target) {
                    //     _assetManagers[id].add(id, source, target);
                    // });

                    // _renderManagers[id].on("rename", function (idd, oldTarget, newTarget) {
                    //     _assetManagers[id].rename(id, oldTarget, newTarget);
                    // });

                    // _renderManagers[id].on("remove", function (id, target) {
                    //     _assetManagers[id].remove(id, target);
                    // });

                    // _renderManagers[id].on("resetLayer", function (id) {
                    //     _assetManagers[id].resetLayer(id);
                    // });

                    // _renderManagers[id].on("resetDocument", function () {
                    //     _assetManagers[id].resetDocument();
                    // });

                }
            });
        });

        _stateManager.on("inactive", function (id) {
            if (_waitingDocuments.hasOwnProperty(id)) {
                _canceledDocuments[id] = true;
            } else {
                _renderManagers[id].finish();
                // _assetManagers[id].finish();

                delete _renderManagers[id];
                // delete _assetManagers[id];
            }
        });
    }

    exports.init = init;
}());
