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

    var assert = require("assert"),
        path = require("path");

    var fs = require("fs-extra"),
        Q = require("q");
        

    var AsyncQueue = require("./asyncqueue");

    // Files that are ignored when trying to determine whether a directory is empty
    var FILES_TO_IGNORE = new RegExp("(.DS_Store)$|(desktop.ini)$", "i");

    var _homeDirectory = process.env[(process.platform === "win32") ? "USERPROFILE" : "HOME"],
        _desktopDirectory = _homeDirectory && path.resolve(_homeDirectory, "Desktop");

    function _cleanup(basePath, targetDirectory) {
        assert(targetDirectory.indexOf(basePath) === 0);

        if (targetDirectory === basePath) {
            return;
        }

        return Q.ninvoke(fs, "readdir", targetDirectory)
            .then(function (files) {
                var nonempty = files.some(function (file) {
                    return !FILES_TO_IGNORE.test(file);
                });

                if (nonempty) {
                    return new Q(false);
                } else {
                    console.log("Cleaning up targetDirectory");
                    return Q.ninvoke(fs, "remove", targetDirectory)
                        .thenResolve(true);
                }
            }).then(function (removed) {
                if (removed) {
                    var parent = path.dirname(targetDirectory);
                    return _cleanup(basePath, parent);
                }
            });

    }

    function _moveFileHelper(sourceFullPath, targetFullPath) {
        var targetDirectory = path.dirname(targetFullPath);

        return Q.ninvoke(fs, "mkdirs", targetDirectory)
            .then(Q.nbind(fs.rename, fs, sourceFullPath, targetFullPath))
            .fail(function (err) {
                console.warn("Unable to move asset into base directory: ", err.stack);
                return Q.ninvoke(fs, "copy", sourceFullPath, targetFullPath)
                    .then(Q.nbind(fs, "remove", sourceFullPath));
            });
    }

    function _removeFileHelper(fullPath) {
        return Q.ninvoke(fs, "remove", fullPath);
    }

    function _appendHelper(fullPath, data) {
        return Q.ninvoke(fs, "appendFile", fullPath, data);
    }

    function FileManager(generator) {
        this._generator = generator;
        this._queue = new AsyncQueue();

        this._queue.pause();
        this._queue.on("error", function (err) {
            console.warn(err); // TODO: log error with generator logger
        });
    }

    FileManager.prototype._basePath = null;

    FileManager.prototype._queue = null;

    FileManager.prototype._nextBaseDirFn = null;

    FileManager.prototype._nextBaseDirPromise = null;

    Object.defineProperties(FileManager.prototype, {
        "basePath": {
            get: function () { return this._basePath; },
            set: function () { throw new Error("Cannot set basePath"); }
        }
    });

    FileManager.prototype._asap = function (fn) {
        this._nextBaseDirFn = fn;

        if (this._nextBaseDirPromise) {
            return;
        }

        this._nextBaseDirPromise = this._queue.pause()
            .then(function () {
                var fn = this._nextBaseDirFn;
                this._nextBaseDirFn = null;

                return fn();
            }.bind(this))
            .finally(function () {
                this._nextBaseDirPromise = null;
                if (this._nextBaseDirFn) {
                    var fn = this._nextBaseDirFn;
                    this._nextBaseDirFn = null;
                    this._asap(fn);
                } else {
                    this._queue.unpause();
                }
            }.bind(this))
            .done();
    };

    FileManager.prototype._later = function (fn) {
        this._queue.push(fn);
    };

    FileManager.prototype.updateBasePath = function (document) {
        var extension = document.extension || "",
            // The file name without its extension (e.g., "Untitled-1" or "hero-image")
            documentName = extension.length ? document.name.slice(0, -extension.length) : document.name,
            // Determine whether the file is saved (i.e., it contains slashes or backslashes and is not in the trash)
            // Note that on Windows, a deleted file is reported without an absolute path
            isSaved = document.saved && document.file.indexOf("/.Trashes/") === -1,
            documentDirectory = isSaved ? document.directory : _desktopDirectory,
            basePath = documentDirectory ? path.resolve(documentDirectory, documentName + "-assets") : null;

        var previousBasePath = this._basePath;

        if (basePath) {
            this._basePath = basePath;
            if (previousBasePath) {
                this._moveBaseDirectory(previousBasePath);
            } else {
                this._initBaseDirectory();
            }
        }
        
        console.log("Base directory:", basePath);

        return basePath;
    };

    FileManager.prototype._initBaseDirectory = function () {
        var basePath = this._basePath;

        // prioritize base directory operations ahead of asset operations
        this._asap(function () {
            console.log("Initializing base directory: ", basePath);
            return Q.ninvoke(fs, "stat", basePath).then(function (stats) {
                if (!stats.isDirectory()) {
                    throw new Error("Can't initialize base directory: file already exists.");
                }
            }, function (err) {
                if (err.code === "ENOENT") {
                    return Q.ninvoke(fs, "mkdir", basePath);
                } else {
                    throw new Error("Can't initialize base directory: ", err);
                }
            });
        }.bind(this));
    };

    FileManager.prototype._moveBaseDirectory = function (previousBasePath) {
        var basePath = this._basePath;

        // prioritize base directory operations ahead of asset operations
        this._asap(function () {
            console.log("Moving base directory:", basePath);
            return Q.ninvoke(fs, "rename", previousBasePath, basePath).fail(function (err) {
                console.warn("Unable to rename base directory: ", err);
                return Q.ninvoke(fs, "copy", previousBasePath, basePath, FILES_TO_IGNORE)
                    .then(Q.bind(fs, "remove", previousBasePath));
            });
        });
    };

    FileManager.prototype.moveFileInto = function (sourceFullPath, targetRelativePath) {
        this._later(function () {
            var basePath = this._basePath;
            if (!basePath) {
                throw new Error("Can't move file: no base path");
            }

            var targetFullPath = path.resolve(basePath, targetRelativePath);

            return _moveFileHelper(sourceFullPath, targetFullPath);
        }.bind(this));
    };

    FileManager.prototype.moveFileWithin = function (sourceRelativePath, targetRelativePath) {
        this._later(function () {
            var basePath = this._basePath;
            if (!basePath) {
                throw new Error("Can't move file: no base path");
            }


            var sourceFullPath = path.resolve(basePath, targetRelativePath),
                targetFullPath = path.resolve(basePath, targetRelativePath);

            return _moveFileHelper(sourceFullPath, targetFullPath)
                .then(function () {
                    var sourceDirectory = path.dirname(sourceFullPath);
                    _cleanup(basePath, sourceDirectory);
                });
        }.bind(this));
    };

    FileManager.prototype.removeFileAbsolute = function (fullPath) {
        this._later(function () {
            return _removeFileHelper(fullPath);
        }.bind(this));
    };

    FileManager.prototype.removeFileWithin = function (relativePath) {
        this._later(function () {
            var basePath = this._basePath;
            if (!basePath) {
                throw new Error("Can't remove file: no base path");
            }
            
            var fullPath = path.resolve(basePath, relativePath);

            return _removeFileHelper(fullPath)
                .then(function () {
                    var targetDirectory = path.dirname(fullPath);
                    return _cleanup(basePath, targetDirectory);
                });
        }.bind(this));
    };

    FileManager.prototype.appendWithin = function (relativePath, data) {
        this._later(function () {
            var basePath = this._basePath;
            if (!basePath) {
                throw new Error("Can't remove file: no base path");
            }
            
            var fullPath = path.resolve(basePath, relativePath);

            return _appendHelper(fullPath, data);
        }.bind(this));
    };

    module.exports = FileManager;
}());