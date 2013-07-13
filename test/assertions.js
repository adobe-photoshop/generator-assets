(function () {
    "use strict";

    var assert = require("nodeunit").assert;

    assert.callsMatchSpecification = function (test, callback, spec) {
        Object.keys(spec).forEach(function (argument) {
            var actual   = JSON.stringify(callback(argument)),
                expected = JSON.stringify(spec[argument]);
            
            test.equal(actual, expected, "Analysis of " + argument);
        });
    };

    assert.functionReportsErrors = function (test, callback, args, expectedErrors) {
        var functionWasCalled = false;

        // Create a copy to prevent side effects when modifying
        expectedErrors = expectedErrors.concat();
        
        function reportError(actualError) {
            if (functionWasCalled) {
                assert.fail(actualError, null, "An error message was sent asynchronously");
                return;
            }

            if (expectedErrors.length === 0) {
                assert.fail(actualError, null, "An extra error message was sent");
                return;
            }
            var expectedError = expectedErrors.shift();
            test.equal(actualError, expectedError, "Incorrect error message");
        }

        // Call callback with the provided arguments + reportError
        callback.apply(null, args.concat([reportError]));
        functionWasCalled = true;
        
        test.deepEqual(expectedErrors, [], expectedErrors.length + " errors were not reported");
    };
}());