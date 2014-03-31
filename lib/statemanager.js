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

    var PLUGIN_ID = require("../package.json").name,
        MENU_ID = "assets",
        // Note to third-party plugin developers: This string format ("$$$...") is used for
        // localization of strings that are built in to Photoshop. Third-party plugins should
        // use a regular string (or use their own approach to localization) for menu labels.
        // The user's locale can be accessed with the getPhotoshopLocale() API call on the
        // Generator singleton.
        //
        // Note to Photoshop engineers: This zstring must be kept in sync with the zstring in
        // generate.jsx in the Photoshop repo.
        // MENU_LABEL = "$$$/JavaScripts/Generator/ImageAssets/Menu=Image Assets";
        // TODO: switch back to localized string
        MENU_LABEL = "Image Assets v" + require("../package.json").version;

    function StateManager(generator, config, logger) {
        EventEmitter.call(this);

        this._generator = generator;
        this._config = config;
        this._logger = logger;

        this._activeDocumentIds = {};

        this._initialized = false;
        this._generator.onPhotoshopEvent("generatorMenuChanged",
            this._handleMenuClicked.bind(this));

        var currentDocPromise = this._initCurrentDocument();

        this._menuPromise = currentDocPromise
            .then(function (enabled) {
                var menuPromise = this._generator.addMenuItem(MENU_ID, MENU_LABEL, true, enabled);

                // Start listening for menu and document change events
                this._generator.onPhotoshopEvent("currentDocumentChanged",
                    this._handleCurrentDocumentChanged.bind(this));
                this._generator.onPhotoshopEvent("documentClosed",
                    this._handleDocumentClosed.bind(this));

                this._initialized = true;
                return menuPromise;
            }.bind(this))
            .fail(function (err) {
                this._logger.error("StateManager initialization failed: ", err);
            }.bind(this));

        this._menuPromise.then(this._updateOpenDocuments.bind(this));
    }

    util.inherits(StateManager, EventEmitter);

    /**
     * The ID of the current document. Only read from _handleMenuClicked.
     * 
     * @type {?number}
     */
    StateManager.prototype._currentDocumentId = null;

    /**
     * The set of currently known active document IDs. Only used to prevent 
     * redundant "active" or "inactive" events from being emitted.
     *
     * @type {Object.<number, boolean>}
     */
    StateManager.prototype._activeDocumentIds = null;

    /**
     * Used to serialize menu events
     *
     * @type {Promise}
     */
    StateManager.prototype._menuPromise = null;

    /**
     * Indicates whether first-run initialization has completed.
     *
     * @type {boolean}
     */
    StateManager.prototype._initialized = false;

    /**
     * Indicates whether a click happened before first-time intialization was complete.
     * 
     * @type {boolean}
     */
    StateManager.prototype._firstTimeClick = false;

    /**
     * Initialize _currentDocumentId and emit an active event if appropriate.
     * 
     * @return {Promise} The conditions described above are met once resolved.
     */
    StateManager.prototype._initCurrentDocument = function () {
        return this._generator.getDocumentInfo(undefined, {
            compInfo:           false,
            imageInfo:          false,
            layerInfo:          false,
            expandSmartObjects: false,
            getTextStyles:      false,
            selectedLayers:     false,
            getCompSettings:    false
        }).then(function (document) {
            var enabled = false;

            if (document) {
                var id = document.id;

                if (document.generatorSettings) {
                    var settings = this._generator.extractDocumentSettings(document, PLUGIN_ID);

                    enabled = !!(settings && settings.enabled);

                    if (settings && settings.enabled) {
                        enabled = true;
                    }
                }

                this._setInternalState(id, enabled);
                this._currentDocumentId = id;

                if (!this._initialized && this._firstTimeClick) {
                    this.activate(id);
                }
            }

            return enabled;
        }.bind(this)).fail(function (err) {
            this._logger.debug("Unable to initialize current document: ", err);
            return false;
        }.bind(this));
    };

    /**
     * Update the state of asset generation for all open documents.
     *
     * @return {Promise} Resolves once internal state has been updated for all open documents
     */
    StateManager.prototype._updateOpenDocuments = function () {
        return this._generator.getOpenDocumentIDs().then(function (ids) {
            var promises = ids.map(function (id) {
                if (!this._activeDocumentIds.hasOwnProperty(id)) {
                    return this._generator.getDocumentSettingsForPlugin(id, PLUGIN_ID).done(function (settings) {
                        var enabled = !!(settings && settings.enabled);

                        this._setInternalState(id, enabled);
                    }.bind(this));
                }
            }.bind(this));

            return Q.allSettled(promises);
        }.bind(this));
    };

    /**
     * Handler for the currentDocumentChanged Photoshop event. Sets _currentDocumentId
     * and, depending on that document's state, sets the menu state and fires an event
     * as appropriate.
     * 
     * @param {number}
     */
    StateManager.prototype._handleCurrentDocumentChanged = function (id) {
        this._logger.debug("Current document ID:", id);

        this._currentDocumentId = id;

        this._generator.getDocumentSettingsForPlugin(id, PLUGIN_ID).done(function (settings) {
            var enabled = !!(settings && settings.enabled);

            this._setMenuState(id, true, enabled);
            this._setInternalState(id, enabled);
        }.bind(this));

        this._updateOpenDocuments();
    };

    StateManager.prototype._handleDocumentClosed = function (id) {
        if (this._currentDocumentId === id) {
            this._currentDocumentId = null;

            this._setMenuState(null, false, false);
        }
    };

    /**
     * Click handler for the plugin's generator menu. If there no document is
     * currently open, do nothing. Otherwise, flip the status of the current 
     * document, record the new state in the document's settings, and set the
     * menu state accordingly. 
     * 
     * @param {{name: string}} event Click event object, which contains at least
     *      the name of the clicked menu item.
     */
    StateManager.prototype._handleMenuClicked = function (event) {
        // Ignore changes to other menus
        var menu = event.generatorMenuChanged;
        if (!menu || menu.name !== MENU_ID) {
            return;
        }

        var currentDocumentId = this._currentDocumentId;
        if (currentDocumentId === null) {
            if (this._initialized) {
                console.warn("Ignoring menu click without a current document.");
            } else {
                this._firstTimeClick = true;
            }
            return;
        }

        var currentMenuState = this._generator.getMenuState(menu.name),
            currentChecked = currentMenuState.checked;

        if (currentChecked) {
            this.deactivate(currentDocumentId);
        } else {
            this.activate(currentDocumentId);
        }
    };

    /**
     * Set the state of the menu (i.e., whether it is enabled and/or checked) as
     * appropriate for the given document. If there are multiple concurrent calls
     * to this function, only the last will be applied.
     * 
     * @param {number} id A document's ID
     * @param {boolean} enabled Whether or not the menu should be enabled
     * @param {boolean} checked Whether or not the menu entry should be checked
     */
    StateManager.prototype._setMenuState = function (id, enabled, checked) {
        // There is a menu operation in progress, save this state change and handle
        // it later when the operation is complete
        if (this._menuPromise && this._menuPromise.inspect().state === "pending") {
            this._nextMenuState = {
                id: id,
                enabled: enabled,
                checked: checked
            };

            return;
        }

        // Execute the state change
        this._menuPromise = this._generator.toggleMenu(MENU_ID, enabled, checked).finally(function () {
            var nextMenuState = this._nextMenuState;

            this._menuPromise = null;
            this._nextMenuState = null;

            // If there is a saved next state, handle it now if it's consistent with the current document id
            if (nextMenuState) {
                if (this._currentDocumentId === nextMenuState.id) {
                    this._setMenuState(nextMenuState.id, nextMenuState.enabled, nextMenuState.checked);
                } else {
                    // Something has gone wrong; reset _currentDocumentId and the menu state
                    this._initCurrentDocument().done(function (enabled) {
                        this._setMenuState(this._currentDocumentId, true, enabled);
                    }.bind(this));
                }
            }
        }.bind(this));
    };

    /**
     * Record the state of the given document ID (i.e., enabled or disabled) and,
     * if the state has changed, emit the appropriate state change event.
     * 
     * @param {number} id A document's ID
     * @param {boolean} enabled Whether or not the document is currently enabled
     */
    StateManager.prototype._setInternalState = function (id, enabled) {
        if (this._activeDocumentIds.hasOwnProperty(id) !== enabled) {
            var eventName = enabled ? "active" : "inactive";

            if (enabled) {
                this._activeDocumentIds[id] = true;
            } else {
                delete this._activeDocumentIds[id];
            }

            this.emit(eventName, id);
        }
    };

    /**
     * Update the document's Generator state.
     * 
     * @private
     * @param {number} id
     * @param {boolean} enabled
     */
    StateManager.prototype._setDocumentState = function (id, enabled) {
        var settings = { enabled: enabled };

        this._generator.setDocumentSettingsForPlugin(settings, PLUGIN_ID).then(function () {
            this._setInternalState(id, enabled);
        }.bind(this)).done();

        this._setMenuState(id, true, enabled);
    };

    /**
     * Deactivate asset generation for the given document ID.
     * 
     * @param {number} id The ID of the Document to deactivate.
     */
    StateManager.prototype.deactivate = function (id) {
        this._setDocumentState(id, false);
    };

    /**
     * Activate asset generation for the given document ID.
     * 
     * @param {number} id The ID of the Document to activate.
     */
    StateManager.prototype.activate = function (id) {
        this._setDocumentState(id, true);
    };

    module.exports = StateManager;
}());