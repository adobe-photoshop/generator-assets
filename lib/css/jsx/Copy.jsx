
const ktextToClipboardStr = app.stringIDToTypeID( "textToClipboard" );
const keyTextData = app.charIDToTypeID('TxtD');

var testStrDesc = new ActionDescriptor();
testStrDesc.putString( keyTextData, params.clipboard);
executeAction( ktextToClipboardStr, testStrDesc, DialogModes.NO);