(function () {
    "use strict";

    // Built-in libraries
    var fs = require("fs");

    // NPM libraries
    var Q = require("q");

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

    exports.deleteFile = deleteFile;
    exports.copyFile   = copyFile;
    exports.moveFile   = moveFile;
}());