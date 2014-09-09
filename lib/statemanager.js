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

    var PLUGIN_ID = require("../package.json").name,
        MENU_ID = PLUGIN_ID,
        // The following constant MUST match the dummy menu ID, which is defined
        // in Presets/Scripts/generate.jsx
        DUMMY_MENU_ID = "generator-assets-dummy-menu",
        DUMMY_MENU_CLICK_TIMEOUT = 3000,
        // Note to third-party plugin developers: This string format ("$$$...") is used for
        // localization of strings that are built in to Photoshop. Third-party plugins should
        // use a regular string (or use their own approach to localization) for menu labels.
        // The user's locale can be accessed with the getPhotoshopLocale() API call on the
        // Generator singleton.
        //
        // Note to Photoshop engineers: This zstring must be kept in sync with the zstring in
        // generate.jsx in the Photoshop repo.
        MENU_LABEL = "$$$/JavaScripts/Generator/ImageAssets/Menu=Image Assets";

    /**
     * Manages the state image asset generation for all documents. Emits "active"
     * and "inactive" events with the following parameter when the state of image
     * asset generation state changes:
     *      1. @param {number} The ID of the document for which image asset
     *          generation is now active or inactive.
     * 
     * @constructor
     * @param {Generator} generator
     * @param {object} config
     * @param {Logger} logger
     * @param {DocumentManager} documentManager
     */
    function StateManager(generator, config, logger, documentManager) {
        EventEmitter.call(this);

        this._generator = generator;
        this._config = config;
        this._logger = logger;

        this._enabledDocumentIds = {};
        this._menuPromise = this._generator.addMenuItem(MENU_ID, MENU_LABEL, false, false)
            .finally(this._processNextMenuOperation.bind(this, false, false));

        documentManager.on("activeDocumentChanged",
            this._handleActiveDocumentChanged.bind(this));
        documentManager.on("openDocumentsChanged",
            this._handleOpenDocumentsChanged.bind(this));
        this._generator.onPhotoshopEvent("generatorMenuChanged",
            this._handleMenuClicked.bind(this));
    }

    util.inherits(StateManager, EventEmitter);

    /**
     * The ID of the currently activeDocument document. Only read from _handleMenuClicked.
     * 
     * @private
     * @type {?number}
     */
    StateManager.prototype._activeDocumentId = null;

    /**
     * The subset of open document IDs for which generator is enabled. Used to
     * prevent redundant "enabled" or "disabled" events from being emitted.
     *
     * @private
     * @type {{number, boolean}}
     */
    StateManager.prototype._enabledDocumentIds = null;

    /**
     * Used to serialize menu events; resolves when menu state updates are complete.
     *
     * @private
     * @type {?Promise}
     */
    StateManager.prototype._menuPromise = null;

    /**
     * Indicates whether we received a dummy menu click and are awaiting a first 
     * activeDocumentChanged event.
     *
     * @private
     * @type {boolean}
     */
    StateManager.prototype._dummyMenuClicked = false;

    /**
     * Handle the openDocumentsChanged event emitted by the DocumentManager.
     * Updates the internal set of documents for which Generator is enabled.
     * 
     * @private
     * @param {Array.<number>} all The complete set of open document IDs
     * @param {Array.<number>=} opened The set of newly opened document IDs
     * @param {Array.<number>=} closed The set of newly closed documentIDs
     */
    StateManager.prototype._handleOpenDocumentsChanged = function (all, opened, closed) {
        var open = opened || all;

        open.forEach(function (id) {
            this._generator.getDocumentSettingsForPlugin(id, PLUGIN_ID).done(function (settings) {
                // If we've already explicitly enabled this document as a result of
                // a dummy menu click then ignore the document's stored settings
                if (this._enabledDocumentIds.hasOwnProperty(id)) {
                    return;
                }
                
                var enabled = !!(settings && settings.enabled);
                this._setInternalState(id, enabled);

                // If the openDocumentsChanged event includes the active document,
                // but the corresponding activeDocumentChange event fired first then
                // that handler would have been unable to set the menu state.
                if (this._activeDocumentId === id) {
                    this._handleActiveDocumentChanged(id);
                }
            }.bind(this));
        }, this);

        if (closed) {
            closed.forEach(function (id) {
                this._setInternalState(id, false);
            }, this);
        }

        if (all.length === 0) {
            this._setMenuState(null, false, false);
        }
    };

    /**
     * Handle the activeDocumentChanged event emitted by the DocumentManager.
     * Updates the menu state.
     * 
     * @private
     * @param {?number} id The ID of the new currently active document, or null if
     *      there is none.
     */
    StateManager.prototype._handleActiveDocumentChanged = function (id) {
        this._activeDocumentId = id;

        if (id) {
            if (this._dummyMenuClicked) {
                this.activate(id);
            } else {
                this._setMenuState(id, true, this._enabledDocumentIds.hasOwnProperty(id));
            }
        } else {
            this._setMenuState(null, false, false);
        }
    };

    /**
     * Click handler for the plugin's generator menu. If there no document is
     * currently open, do nothing. Otherwise, flip the status of the current 
     * document, record the new state in the document's settings, and set the
     * menu state accordingly. 
     * 
     * @private
     * @param {{name: string}} event Click event object, which contains at least
     *      the name of the clicked menu item.
     */
    StateManager.prototype._handleMenuClicked = function (event) {
        var menu = event.generatorMenuChanged;
        if (!menu) {
            return;
        }

        if (menu.name === DUMMY_MENU_ID) {
            // When we receive a dummy menu click, instead of toggling the
            // generator status for the current document we should force
            // generator to be enabled. However, we may or may not have
            // received an activeDocumentChanged event by the time of the
            // click. If we HAVE received such an event and know the active
            // document, explicitly activate it as a result of the dummy menu
            // click. Otherwise, note that we have received a dummy menu click
            // and wait a few seconds for an activeDocumentChanged event. If
            // the event arrives, activate that document. Otherwise, clear the
            // flag and proceed as usual.
            if (this._activeDocumentId !== null) {
                this.activate(this._activeDocumentId);
            } else {
                this._dummyMenuClicked = true;

                setTimeout(function () {
                    this._dummyMenuClicked = false;
                }.bind(this), DUMMY_MENU_CLICK_TIMEOUT);
            }
            return;
        }

        // Ignore changes to other menus
        if (menu.name !== MENU_ID) {
            return;
        }

        var activeDocumentId = this._activeDocumentId;
        if (activeDocumentId === null) {
            this._logger.warn("Ignoring menu click without a current document.");
            return;
        }

        var currentMenuState = this._generator.getMenuState(menu.name),
            currentChecked = currentMenuState.checked;

        if (currentChecked) {
            this.deactivate(activeDocumentId);
        } else {
            this.activate(activeDocumentId);
        }
    };

    /**
     * After a menu operation (either creation or toggling), this method should
     * be called to determine if there is another pending menu operation. If so
     * that operation is executed asynchronously.
     * 
     * @private
     * @param {boolean} enabled Whether the previous menu operation left the menu enabled
     * @param {boolean} checked Whether the previous menu operation left the menu checked
     */
    StateManager.prototype._processNextMenuOperation = function (enabled, checked) {
        var nextMenuState = this._nextMenuState;

        this._menuPromise = null;
        this._nextMenuState = null;

        // If there is a saved next state, handle it now if it's consistent with the current document id
        if (nextMenuState) {
            if (this._activeDocumentId === nextMenuState.id) {
                if (enabled !== nextMenuState.enabled || checked !== nextMenuState.checked) {
                    this._setMenuState(nextMenuState.id, nextMenuState.enabled, nextMenuState.checked);
                }
            } else {
                // Something went wrong; reset menu state to that of _activeDocumentId
                var nextEnabled = this._activeDocumentId !== null,
                    nextChecked = this._enabledDocumentIds.hasOwnProperty(this._activeDocumentId);

                this._setMenuState(this._activeDocumentId, nextEnabled, nextChecked);
            }
        }
    };

    /**
     * Set the state of the menu (i.e., whether it is enabled and/or checked) as
     * appropriate for the given document. If there are multiple concurrent calls
     * to this function, only the last will be applied.
     * 
     * @private
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
        this._menuPromise = this._generator.toggleMenu(MENU_ID, enabled, checked)
            .finally(this._processNextMenuOperation.bind(this, enabled, checked));
    };

    /**
     * Record the state of the given document ID (i.e., enabled or disabled) and,
     * if the state has changed, emit the appropriate state change event.
     * 
     * @private
     * @param {number} id A document's ID
     * @param {boolean} enabled Whether or not the document is currently enabled
     */
    StateManager.prototype._setInternalState = function (id, enabled) {
        if (this._enabledDocumentIds.hasOwnProperty(id) !== enabled) {
            var eventName = enabled ? "enabled" : "disabled";

            if (enabled) {
                this._enabledDocumentIds[id] = true;
            } else {
                delete this._enabledDocumentIds[id];
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

        this._generator.setDocumentSettingsForPlugin(settings, PLUGIN_ID).done();
        this._setInternalState(id, enabled);
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
