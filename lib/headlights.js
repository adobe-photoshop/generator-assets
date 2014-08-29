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

    var PLUGIN_IDENTIFIER = "generator-assets";

    var _packageConfig = require("../package.json");

    var _generator,
        _nextRenderCount = 1,
        _lastLoggedWithCrema = 0, // only log one of each of these per day
        _lastLoggedWithoutCrema = 0,
        _oneDay = 1000 * 60 * 60 * 24; // num msec in one day


    function _logEnable() {
        _generator._logHeadlights("Enable Image Assets");
    }

    function _logDisable() {
        _generator._logHeadlights("Disable Image Assets");
    }

    function _logRender(count, document) {
        if (count === _nextRenderCount) {
            _nextRenderCount *= 2;
            _generator._logHeadlights("Generated asset count: " + count);
        }

        var usedCrema = false,
            now = new Date().getTime();
        //  did user use crema to setup asset extraction for this document?
        if (document && document.generatorSettings && document.generatorSettings.crema) {
            usedCrema = true;
        }

        if (usedCrema) {
            if (now > _lastLoggedWithCrema + _oneDay) {
                _generator._logHeadlights("Rendered With Crema");
                _generator._logHeadlights("Rendered With Crema auto");
                _lastLoggedWithCrema = now;
            }
        } else {
            if (now > _lastLoggedWithoutCrema + _oneDay) {
                _generator._logHeadlights("Rendered Without Crema");
                _lastLoggedWithoutCrema = now;
            }
        }
    }

    function init(generator, logger, stateManager, renderManager) {
        if (_packageConfig.name !== PLUGIN_IDENTIFIER) {
            // If someone has copied this plug-in to create a third-party plugin (i.e. if we aren't
            // "generator-assets"), then don't initialize Headlights logging.
            logger.error("Headlights: package name does not match expected identifier, skipping init. " +
                "Consider removing Headlights initialization from main if this plugin is " +
                "a fork of generator-assets");
            return;
        }

        renderManager.on("render", _logRender);
        stateManager.on("enabled", _logEnable);
        stateManager.on("disabled", _logDisable);

        _generator = generator;
    }

    exports.init = init;
}());
