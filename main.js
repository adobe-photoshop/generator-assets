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
        AssetManager = require("./lib/assetmanager"),
        Headlights = require("./lib/headlights");
    
    var PLUGIN_ID = require("./package.json").name;

    var _generator,
        _config,
        _logger,
        _documentManager,
        _stateManager,
        _renderManager,
        _SONToCSSConverter;

    var _assetManagers = {};

    var _waitingDocuments = {},
        _canceledDocuments = {};

    /**
     * Disable asset generation for the given Document ID, halting any asset
     * rending in progress.
     * 
     * @private
     * @param {!number} id The document ID for which asset generation should be disabled.
     */
    function _pauseAssetGeneration(id) {
        if (_waitingDocuments.hasOwnProperty(id)) {
            _canceledDocuments[id] = true;
        } else if (_assetManagers.hasOwnProperty(id)) {
            _assetManagers[id].stop();
        }
    }

    /**
     * Completely stop asset generation for the given Document ID and collect
     * its AssetManager instance.
     * 
     * @private
     * @param {!number} id The document ID for which asset generation should be disabled.
     */
    function _stopAssetGeneration(id) {
        _pauseAssetGeneration(id);

        if (_assetManagers.hasOwnProperty(id)) {
            delete _assetManagers[id];
        }
    }

    /**
     * Handler for a the "file" change event fired by Document objects. Disables
     * asset generation after Save As is performed on an an already-saved file.
     * 
     * @private
     * @param {number} id The ID of the Document that changed
     * @param {{previous: string=, previousSaved: boolean=}}} change The file
     *      change event emitted by the Document
     */
    function _handleFileChange(id, change) {
        // If the filename changed but the saved state didn't change, then the file must have been renamed
        if (change.previous && !change.hasOwnProperty("previousSaved")) {
            _stopAssetGeneration(id);
            _stateManager.deactivate(id);
        }
    }

    /**
     * Handler for a the "openDocumentsChanged" event emitted by the DocumentManager.
     * Registers a generatorSettings change to update the StateManager appropiately
     * 
     * @private
     * @param {Array.<number>} all The complete set of open document IDs
     * @param {Array.<number>=} opened The set of newly opened document IDs
     */
    function _handleOpenDocumentsChanged(all, opened) {
        var open = opened || all;

        open.forEach(function (id) {
            _documentManager.getDocument(id).done(function (document) {
                document.on("generatorSettings", _handleDocGeneratorSettingsChange.bind(undefined, id));
            }, function (error) {
                _logger.warning("Error getting document during a document changed event, " +
                    "document was likely closed.", error);
            });
        });
    }

    /**
     * Extract generator settings from the "current" or "previous" property of a generatorSettings
     * change event. If the supplied value is not actually a settings object, returns null.
     *
     * @private
     * @param {object} settings Settings json object.
     * @return {object} Settings object from generator or null.
     */
    function _getChangedSettings(settings) {
        if (settings && typeof(settings) === "object") {
            return _generator.extractDocumentSettings({generatorSettings: settings}, PLUGIN_ID);
        }
        return null;
    }

    /**
     * Handler for a the "generatorSettings" change event fired by Document objects. Updates
     * the state manger based on the current doc setting if the enable settings actually 
     * changed
     * 
     * @private
     * @param {number} id The ID of the Document that changed
     * @param {{previous: settings=, current: settings=}}} change The previous and current
     *      document settings
     */
    function _handleDocGeneratorSettingsChange(id, change) {
        var curSettings = _getChangedSettings(change.current),
            prevSettings = _getChangedSettings(change.previous),
            curEnabled = !!(curSettings && curSettings.enabled),
            prevEnabled = !!(prevSettings && prevSettings.enabled);
        
        if (prevEnabled !== curEnabled) {
            if (curEnabled) {
                _stateManager.activate(id);
            } else {
                _stateManager.deactivate(id);
            }
        }
    }

    /**
     * Enable asset generation for the given Document ID, causing all annotated
     * assets in the given document to be regenerated.
     * 
     * @private
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
     * Restart asset generation for the given Document ID. This is called when
     * a Document emits an "end" event, indicating that there was an error
     * updating its internal state as from Photoshop's change events.
     * 
     * @private
     * @param {!number} id The document ID for which asset generation should be enabled.
     */
    function _restartAssetGeneration(id) {
        _stopAssetGeneration(id);
        _startAssetGeneration(id);
    }

    /**
     * Get a copy of the plugin's config object. For automated testing only.
     * 
     * @private
     * @return {object}
     */
    function _getConfig() {
        var copy = {},
            property;

        for (property in _config) {
            if (_config.hasOwnProperty(property)) {
                copy[property] = _config[property];
            }
        }
 
        return copy;
    }

    /**
     * Set the plugin's config object. This mutates the referenced object, not the
     * reference. For automated testing only.
     * 
     * @private
     * @param {object} config
     */
    function _setConfig(config) {
        var property;

        // clear out the existing properties
        for (property in _config) {
            if (_config.hasOwnProperty(property)) {
                delete _config[property];
            }
        }

        // add in the new properties
        for (property in config) {
            if (config.hasOwnProperty(property)) {
                _config[property] = config[property];
            }
        }
    }


    /**
     * Initialize the Assets plugin.
     * 
     * @param {Generator} generator The Generator instance for this plugin.
     * @param {object} config Configuration options for this plugin.
     * @param {Logger} logger The Logger instance for this plugin.
     */
    function init(generator, config, logger) {
        _generator = generator;
        _config = config;
        _logger = logger;

        _documentManager = new DocumentManager(generator, config, logger);
        _stateManager = new StateManager(generator, config, logger, _documentManager);
        _renderManager = new RenderManager(generator, config, logger);

        if (!!_config["css-enabled"]) {
            var SONToCSS = require("./lib/css/sontocss.js");
            _SONToCSSConverter = new SONToCSS(generator, config, logger, _documentManager);
        }

        // For automated tests
        exports._renderManager = _renderManager;
        exports._stateManager = _stateManager;
        exports._assetManagers = _assetManagers;
        exports._layerNameParse = require("./lib/parser").parse;

        _stateManager.on("enabled", _startAssetGeneration);
        _stateManager.on("disabled", _pauseAssetGeneration);
        _documentManager.on("openDocumentsChanged", _handleOpenDocumentsChanged);

        Headlights.init(generator, logger, _stateManager, _renderManager);
    }


    exports.init = init;

    // For automated tests
    exports._getConfig = _getConfig;
    exports._setConfig = _setConfig;
}());
