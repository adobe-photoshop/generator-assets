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

    var util = require("util"),
        resolve = require("path").resolve;

    var GET_LAYER_PIXMAP_FILENAME = resolve(__dirname, "lib/jsx/get_layer_pixmap.jsx");

    var _generator = null;

    function handleImageChanged(message) {
        console.log("Asset got image changed: \n" + util.inspect(message, false, 5) + "\n\n");

        var changeInfo = message[0];
        if (changeInfo.documentID && changeInfo.layerEvents) {
            changeInfo.layerEvents.forEach(function (e) {
                console.log("[dump] %d-%d", changeInfo.documentID, e.layerID);
                _generator.executeJSXFile(GET_LAYER_PIXMAP_FILENAME, {layerID : e.layerID, scale: 1}).then(
                    function () {
                        console.log("dump resolved", arguments);
                    }, function () {
                        console.log("dump rejected", arguments);
                    }
                );
            });
        }
    }

    function init(generator) {
        _generator = generator;
        _generator.subscribe("photoshop.imageChanged", handleImageChanged);
    }

    exports.init = init;

}());