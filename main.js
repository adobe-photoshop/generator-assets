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

    var DocumentManager = require("./lib/documentmanager"),
        StateManager = require("./lib/statemanager"),
        RenderManager = require("./lib/rendermanager"),
        AssetManager = require("./lib/assetmanager");

    var _generator,
        _config,
        _documentManager,
        _stateManager,
        _renderManager;

    var _assetManagers = {};

    var _waitingDocuments = {},
        _canceledDocuments = {};

    /**
     * Enable asset generation for the given Document ID, causing all annotated
     * assets in the given document to be regenerated.
     * 
     * @param {!number} id The document ID for which asset generation should be enabled.
     */
    function _enableAssetGeneration(id) {
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
                if (!_assetManagers.hasOwnProperty(id)) {
                    _assetManagers[id] = new AssetManager(_generator, _config, document, _renderManager);

                    document.on("close", function () {
                        _assetManagers[id].pause();
                        delete _assetManagers[id];
                    }.bind(this));
                }
                _assetManagers[id].unpause();
            }
        });
    }

    /**
     * Disable asset generation for the given Document ID, halting any asset
     * rending in progress.
     * 
     * @param {!number} id The document ID for which asset generation should be disabled.
     */
    function _disableAssetGeneration(id) {
        if (_waitingDocuments.hasOwnProperty(id)) {
            _canceledDocuments[id] = true;
        } else {
            _assetManagers[id].pause();
        }
    }

    /**
     * Initialize the Assets plugin.
     * 
     * @param {Generator} generator The Generator instance for this plugin.
     * @param {object} config Configuration options for this plugin.
     */
    function init(generator, config) {
        _generator = generator;
        _config = config;
        _documentManager = new DocumentManager(generator, config);
        _stateManager = new StateManager(generator, config);
        _renderManager = new RenderManager(generator, config);

        _stateManager.on("active", _enableAssetGeneration);
        _stateManager.on("inactive", _disableAssetGeneration);
    }

    exports.init = init;
}());
