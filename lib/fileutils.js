/*
 * Copyright (c) 2015 Adobe Systems Incorporated. All rights reserved.
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

/*jslint vars: true, node: true, plusplus: true, devel: true, nomen: true, indent: 4*/

(function () {
    "use strict";

    var path = require("path"),
        exec = require("child_process").exec,
        Promise = require("bluebird");

    var gFolderShownInOS = {};

    /**
     * Opens the given folder in the OS
     *
     * @param {string} destFolder
     * return {Promise}
     */
    var openFolderInOS = function (destFolder) {
        var win32 = process.platform === "win32",
            command = "";

        destFolder = path.normalize(destFolder);

        if (!destFolder) {
            return Promise.resolve();
        }
        
        if (win32) {
            command = "explorer /root," + destFolder;
        } else {
            command = "open '" + destFolder + "'";
        }
        return Promise.promisify(exec)(command);
    };
    
    /**
     * Opens the given folder in the OS, but only runs once per session
     *
     * @param {string} destFolder
     * return {Promise}
     */
    var openFolderOnceInOS = function (destFolder) {
        if (!gFolderShownInOS[destFolder]) {
            gFolderShownInOS[destFolder] = true;
            return exports.openFolderInOS(destFolder);
        }
        return Promise.resolve();
    };

    exports.openFolderInOS = openFolderInOS;
    exports.openFolderOnceInOS = openFolderOnceInOS;
}());
