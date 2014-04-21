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

    var assert = require("assert");

    var _getSetName = function (name) {
        var capName = name[0].toUpperCase() + name.substring(1, name.length);

        return "_set" + capName;
    };

    var _set = function (name, value) {
        var property = "_" + name;

        this[property] = value;
    };

    var _update = function (name, value) {
        var setName = _getSetName(name),
            property = "_" + name,
            previous = this[property];

        this[setName].call(this, value);

        if (this[property] !== previous) {
            return {
                previous: previous
            };
        }
    };

    function LayerComp(document, raw) {
        this._document = document;
        this._logger = document._logger;

        var property;
        for (property in raw) {
            if (raw.hasOwnProperty(property)) {
                switch (property) {
                case "id":
                    this._id = raw.id;
                    break;
                case "name":
                    this._setName(raw.name);
                    break;
                case "applied":
                    this._setApplied(raw.applied);
                    break;
                case "appearance":
                    this._setAppearance(raw.appearance);
                    break;
                case "position":
                    this._setPosition(raw.position);
                    break;
                case "visibility":
                    this._setVisibility(raw.visibility);
                    break;
                default:
                    this._logger.warn("Unhandled property in raw constructor:", property, raw[property]);
                }
            }
        }
    }

    Object.defineProperties(LayerComp.prototype, {
        "id": {
            get: function () { return this._id; },
        },
        "name": {
            get: function () { return this._name; },
        },
        "applied": {
            get: function () { return this._applied; },
        },
        "appearance": {
            get: function () { return this._appearance; },
        },
        "position": {
            get: function () { return this._position; },
        },
        "visibility": {
            get: function () { return this._visibility; },
        },
    });

    LayerComp.prototype._id = null;

    LayerComp.prototype._name = null;

    LayerComp.prototype._applied = null;

    LayerComp.prototype._appearance = null;

    LayerComp.prototype._position = null;

    LayerComp.prototype._visibility = null;

    LayerComp.prototype._setName = function (raw) {
        _set.call(this, "name", raw);
    };

    LayerComp.prototype._updateName = function (raw) {
        return _update.call(this, "name", raw);
    };

    LayerComp.prototype._setApplied = function (raw) {
        _set.call(this, "applied", raw);
    };

    LayerComp.prototype._updateApplied = function (raw) {
        return _update.call(this, "applied", raw);
    };

    LayerComp.prototype._setAppearance = function (raw) {
        _set.call(this, "appearance", raw);
    };

    LayerComp.prototype._updateAppearance = function (raw) {
        return _update.call(this, "appearance", raw);
    };

    LayerComp.prototype._setPosition = function (raw) {
        _set.call(this, "position", raw);
    };

    LayerComp.prototype._updatePosition = function (raw) {
        return _update.call(this, "position", raw);
    };

    LayerComp.prototype._setVisibility = function (raw) {
        _set.call(this, "visibility", raw);
    };

    LayerComp.prototype._updateVisibility = function (raw) {
        return _update.call(this, "visibility", raw);
    };

    LayerComp.prototype._applyChange = function (raw) {
        assert.strictEqual(this.id, raw.id, "LayerComp ID mismatch");

        var changes = {},
            property,
            change;
        
        for (property in raw) {
            if (raw.hasOwnProperty(property)) {
                switch (property) {
                case "id":
                    break;
                case "name":
                    change = this._updateName(raw.name);
                    if (change) {
                        changes.name = change;
                    }
                    break;
                case "applied":
                    change = this._updateApplied(raw.applied);
                    if (change) {
                        changes.applied = change;
                    }
                    break;
                case "appearance":
                    change = this._updateAppearance(raw.appearance);
                    if (change) {
                        changes.appearance = change;
                    }
                    break;
                case "position":
                    change = this._updatePosition(raw.position);
                    if (change) {
                        changes.position = change;
                    }
                    break;
                case "visibility":
                    change = this._updateVisibility(raw.visibility);
                    if (change) {
                        changes.visibility = change;
                    }
                    break;
                case "captured":
                    //specified in change when comp is re-captured (synced w/doc state)
                    changes.captured = raw.captured;
                    break;
                case "added":
                    changes.added = raw.added;
                    break;
                case "removed":
                    changes.removed = raw.removed;
                    break;
                default:
                    this._logger.warn("Unhandled property in raw change:", property, raw[property]);
                }
            }
        }

        if (Object.keys(changes).length > 0) {
            return changes;
        }
    };

    module.exports = LayerComp;
}());