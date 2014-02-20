(function () {
    "use strict";

    // Built-in libraries
    var fs = require("fs"),
        resolve = require("path").resolve;

    // NPM libraries
    var Q = require("q"),
        mkdirp = require("mkdirp");

    // Files that are ignored when trying to determine whether a directory is empty
    var FILES_TO_IGNORE = [".ds_store", "desktop.ini"];

    var generator,
        config;

    function deleteDirectoryIfEmpty(directory) {
        try {
            if (!fs.existsSync(directory)) {
                console.log("Not deleting directory %j: it doesn't exist", directory);
                return;
            }
            
            var files = fs.readdirSync(directory),
                filesToKeep = files.filter(function (fileName) {
                    return FILES_TO_IGNORE.indexOf(fileName.toLowerCase()) === -1;
                });
            
            if (filesToKeep.length === 0) {
                if (files.length) {
                    console.log("Deleting unimportant files in %j: %j", directory, files);
                    files.forEach(function (fileName) {
                        fs.unlinkSync(resolve(directory, fileName));
                    });
                }
                console.log("Deleting empty directory %j", directory);
                fs.rmdirSync(directory);
            } else {
                console.log("Not deleting directory %j, it still contains items to keep: %j", directory, filesToKeep);
            }

            return true;
        } catch (e) {
            console.error("Error while trying to delete directory %j (if empty): %s", directory, e.stack);
            return false;
        }
    }

    function deleteFile(path) {
        var deleteDeferred = Q.defer();

        fs.exists(path, function (exists) {
            if (!exists) {
                deleteDeferred.resolve();
                return;
            }

            fs.unlink(path, function (unlinkError) {
                if (unlinkError) {
                    deleteDeferred.reject(unlinkError);
                } else {
                    deleteDeferred.resolve();
                }
            });
        });

        return deleteDeferred.promise;
    }

    function deleteFileSync(path) {
        try {
            if (fs.existsSync(path)) {
                console.log("Deleting %j", path);
                fs.unlinkSync(path);
            } else {
                console.log("Not deleting file %j - it does not exist", path);
            }
        } catch (e) {
            console.error("Error while deleting %j: %s", path, e.stack);
        }
    }

    function copyFile(sourcePath, targetPath) {
        var copyDoneDeferred = Q.defer(),
            readStream,
            writeStream;

        function onStreamError(err) {
            // First reject
            copyDoneDeferred.reject(err);

            // Then close the streams so that we leave no open handles on the files
            try {
                readStream.close();
            } catch (e) {
                // Ignore the error
            }
            try {
                writeStream.close();
            } catch (e) {
                // Ignore the error
            }
        }
        
        try {
            // Create file streams
            readStream  = fs.createReadStream(sourcePath);
            writeStream = fs.createWriteStream(targetPath);
            
            // Register error handlers
            readStream.on("error", function (err) {
                onStreamError("Error while reading " + sourcePath + ": " + err);
            });
            writeStream.on("error", function (err) {
                onStreamError("Error while writing " + targetPath + ": " + err);
            });

            // Pipe the contents of sourcePath to targetPath
            readStream.pipe(writeStream);

            // Resolve when the write stream is closed
            writeStream.on("close", function () {
                copyDoneDeferred.resolve();
            });
        } catch (e) {
            copyDoneDeferred.reject(e);
        }

        return copyDoneDeferred.promise;
    }

    function moveFile(sourcePath, targetPath, deleteSourceOnError) {
        var moveDoneDeferred = Q.defer();

        fs.rename(sourcePath, targetPath, function (renameError) {
            function onCopyDone(copyError) {
                function onDeleteDone(deleteError) {
                    var error;
                    if (deleteError && copyError) {
                        error = copyError + "\n" + deleteError;
                    } else {
                        error = copyError || deleteError;
                    }
                    
                    if (error) {
                        moveDoneDeferred.reject(error);
                    } else {
                        moveDoneDeferred.resolve();
                    }
                }

                if (!copyError || deleteSourceOnError) {
                    deleteFile(sourcePath).then(
                        function () {
                            onDeleteDone();
                        },
                        function (deleteError) {
                            onDeleteDone(deleteError);
                        }
                    );
                } else {
                    onDeleteDone();
                }
            }

            // Renaming the file worked: we're done
            if (!renameError) {
                moveDoneDeferred.resolve();
            } else {
                // There was an error when renaming, so let's try copy + delete instead
                return copyFile(sourcePath, targetPath).then(
                    // If successful, make sure to call onCopyDone without arguments
                    function () { onCopyDone(); },
                    // Otherwise, use it as an error handler
                    onCopyDone
                );
            }
        });

        return moveDoneDeferred.promise;
    }

    function stringify(object) {
        try {
            return JSON.stringify(object, null, "    ");
        } catch (e) {
            console.error(e);
        }
        return String(object);
    }

    function reportErrorsToUser(documentContext, errors) {
        if (!errors.length) {
            return;
        }
        if (documentContext.assetGenerationEnabled && documentContext.assetGenerationDir) {
            var text = "[" + new Date() + "]\n" + errors.join("\n") + "\n\n",
                directory = documentContext.assetGenerationDir;
            mkdirp.sync(directory);
            var errorsFile = resolve(directory, "errors.txt");
            try {
                fs.appendFileSync(errorsFile, text);
            } catch (e) {
                console.error("Failed to write to file %j: %s", errorsFile, e.stack);
                console.log("Errors were: %s", text);
            }
        }
    }

    exports.generator               = generator;
    exports.config                  = config;
    exports.deleteDirectoryIfEmpty  = deleteDirectoryIfEmpty;
    exports.deleteFile              = deleteFile;
    exports.deleteFileSync          = deleteFileSync;
    exports.copyFile                = copyFile;
    exports.moveFile                = moveFile;
    exports.stringify               = stringify;
    exports.reportErrorsToUser      = reportErrorsToUser;
}());