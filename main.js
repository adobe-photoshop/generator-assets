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
        _logger,
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
    function _startAssetGeneration(id) {
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
                    _assetManagers[id] = new AssetManager(_generator, _config, _logger, document, _renderManager);

                    document.on("closed", _stopAssetGeneration.bind(undefined, id));
                    document.on("end", _restartAssetGeneration.bind(undefined, id));
                    document.on("file", _handleFileChange.bind(undefined, id));
                }
                _assetManagers[id].start();
            }
        });
    }

    /**
     * Disable asset generation for the given Document ID, halting any asset
     * rending in progress.
     * 
     * @param {!number} id The document ID for which asset generation should be disabled.
     */
    function _pauseAssetGeneration(id) {
        if (_waitingDocuments.hasOwnProperty(id)) {
            _canceledDocuments[id] = true;
        } else if (_assetManagers.hasOwnProperty(id)) {
            _assetManagers[id].stop();
        }
    }

    function _stopAssetGeneration(id) {
        _pauseAssetGeneration(id);

        if (_assetManagers.hasOwnProperty(id)) {
            delete _assetManagers[id];
        }
    }

    function _restartAssetGeneration(id) {
        _stopAssetGeneration(id);
        _startAssetGeneration(id);
    }

    function _handleFileChange(id, change) {
        // If the filename changed but the saved state didn't change, then the file must have been renamed
        if (change.previous && !change.hasOwnProperty("previousSaved")) {
            _stopAssetGeneration(id);
            _stateManager.deactivate(id);
        }
    }

    /**
     * Initialize the Assets plugin.
     * 
     * @param {Generator} generator The Generator instance for this plugin.
     * @param {object} config Configuration options for this plugin.
     */
    function init(generator, config, logger) {
        _generator = generator;
        _config = config;
        _logger = logger;

        _documentManager = new DocumentManager(generator, config, logger);
        _stateManager = new StateManager(generator, config, logger);
        _renderManager = new RenderManager(generator, config, logger);

        _stateManager.on("active", _startAssetGeneration);
        _stateManager.on("inactive", _pauseAssetGeneration);
    }

    exports.init = init;
}());
