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
     */
    function StateManager(generator, config, logger) {
        EventEmitter.call(this);

        this._generator = generator;
        this._config = config;
        this._logger = logger;

        this._enabledDocumentIds = {};
        this._menuPromise = this._generator.addMenuItem(MENU_ID, MENU_LABEL, false, false)
            .finally(this._processNextMenuOperation.bind(this, false, false));

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
     * Handle the activeDocumentChanged event emitted by the DocumentManager.
     * Updates the menu state.
     * 
     * @private
     * @param {?number} id The ID of the new currently active document, or null if
     *      there is none.
     * @param {boolean} checked If the menu item should be checked
     */
    StateManager.prototype.setState = function (id, checked) {
        this._logger.debug("setState", id, checked);
        if (id) {
            this._setMenuState(id, true, checked);
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

        // TODO can we get rid of DUMMY_MENU_ID? We'll handle it the same way as regular menu anyway.
        if (menu.name === DUMMY_MENU_ID) {
            this._logger.warn("DUMMY MENU ITEM CLICKED");
        }

        if (menu.name !== MENU_ID && menu.name !== DUMMY_MENU_ID) {
            return;
        }

        this.emit("menuToggled");
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
            if (enabled !== nextMenuState.enabled || checked !== nextMenuState.checked) {
                this._setMenuState(nextMenuState.id, nextMenuState.enabled, nextMenuState.checked);
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
     * Deactivate asset generation for the given document ID.
     * 
     * @param {number} id The ID of the Document to deactivate.
     */
    StateManager.prototype.deactivate = function (id) {
        this._setMenuState(id, true, false);
    };

    /**
     * Activate asset generation for the given document ID.
     * 
     * @param {number} id The ID of the Document to activate.
     */
    StateManager.prototype.activate = function (id) {
        this._setMenuState(id, true, true);
    };

    module.exports = StateManager;
}());
