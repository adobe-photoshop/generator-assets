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

    var _generator,
        _config,
        _logger,
        _documentManager,
        _stateManager,
        _renderManager,
        _assetManagers,
        _SONToCSSConverter;

    /**
     * Update the menu/state if the ID matches the current document.
     * Changes to the asset generation status of a document may occur when it is not the active document in photoshop
     *
     * @private
     * @param {number} id
     * @param {boolean} checked
     */
    function _updateMenuIfActiveDoc(id, checked) {
        if (id === _documentManager.getActiveDocumentID()) {
            _stateManager.setState(id, checked);
        }
    }

    /**
     * Test if there an active AssetManager for the given document
     *
     * @private
     * @param {number} id
     * @return {boolean}
     */
    function _documentIsGenerating(id) {
        return _assetManagers.has(id);
    }

    /**
     * Start an AssetManager and add it to the local map of managers.
     *
     * @private
     * @param {Document} document
     */
    function _startAssetManager(document) {
        try {
            var id = document.id,
                assetManager = new AssetManager(_generator, _config, _logger, document, _renderManager);

            _assetManagers.set(id, assetManager);

            assetManager.once("idle", function () {
                _logger.info("Asset generation complete", id);
                _assetManagers.delete(id);
                _updateMenuIfActiveDoc(id, false);
            });

            _logger.info("Starting asset generation, starting asset manager", id);
            assetManager.start();
        } catch (err) {
            _logger.error("Failed to start asset generation", err);
            _updateMenuIfActiveDoc(id, false);
        }
    }

    /**
     * Enable asset generation for the given Document ID, causing all annotated
     * assets in the given document to be regenerated.
     *
     * Update menu state accordingly
     *
     * @param {!number} id The document ID for which asset generation should be enabled.
     */
    function startAssetGeneration(id) {
        if (_documentIsGenerating(id)) {
            throw new Error("Can not start asset generation, already in progress");
        }

        _updateMenuIfActiveDoc(id, true);

        _logger.info("Starting asset generation, retrieving document", id);

        _documentManager.getDocument(id).done(_startAssetManager, function (err) {
            _logger.error("Failed to start asset generation, could not retrieve document", err);
            _updateMenuIfActiveDoc(id, false);
        });
    }

    /**
     * Abort generation of assets for the given document
     *
     * @param {!number} id
     * @param {string=} reason
     */
    function stopAssetGeneration(id, reason) {
        if (_documentIsGenerating(id)) {
            _logger.info("Stopping asset generation", reason);
            _updateMenuIfActiveDoc(id, false);
            _assetManagers.get(id).stop();
            _assetManagers.delete(id);
        }
    }

    /**
     * For the current document, toggle assert generation
     *
     */
    function toggleAssetGeneration() {
        var id = _documentManager.getActiveDocumentID();

        if (!id) {
            return;
        }

        if (_documentIsGenerating(id)) {
            _logger.debug("TOGGLE generation, current: TRUE");
            stopAssetGeneration(id, "menu toggle");
        } else {
            _logger.debug("TOGGLE generation, current: FALSE");
            startAssetGeneration(id);
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
        _assetManagers = new Map();

        if (!!_config["css-enabled"]) {
            var SONToCSS = require("./lib/css/sontocss.js");
            _SONToCSSConverter = new SONToCSS(generator, config, logger, _documentManager);
        }

        // For automated tests
        exports.startAssetGeneration = startAssetGeneration;
        exports._renderManager = _renderManager;
        exports._stateManager = _stateManager;
        exports._assetManagers = _assetManagers;
        exports._layerNameParse = require("./lib/parser").parse;

        _documentManager.on("activeDocumentChanged", function (id) {
            _logger.debug("Handling activeDocumentChanged", id);
            _stateManager.setState(id, _documentIsGenerating(id));
        });

        _documentManager.on("documentClosed", stopAssetGeneration);

        _stateManager.on("menuToggled", toggleAssetGeneration);

        Headlights.init(generator, logger, _stateManager, _renderManager);
    }


    exports.init = init;

    // ######### For automated tests ##############
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

    exports._getConfig = _getConfig;
    exports._setConfig = _setConfig;
}());
