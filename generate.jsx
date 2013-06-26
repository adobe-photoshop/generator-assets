// (c) Copyright 2007 Adobe Systems, Inc. All rights reserved.
// Written by Ed Rose
// based on the ADM Mode Change by Joe Ault from 1998

/*
@@@BUILDINFO@@@ Generate.jsx 1.0.0.0
*/

/* Special properties for a JavaScript to enable it to behave like an automation plug-in, the variable name must be exactly 
   as the following example and the variables must be defined in the top 10000 characters of the file, 
   
// BEGIN__HARVEST_EXCEPTION_ZSTRING

<javascriptresource>
<name>$$$/JavaScripts/Generate/Name=Web Assets</name>
<menu>generate</menu>
<enableinfo>true</enableinfo>
<eventid>CA37AEAF-6272-41F7-8258-F272711964E2</eventid>
<about>Floop</about>
</javascriptresource>

// END__HARVEST_EXCEPTION_ZSTRING

   The item tagged "name" specifies the localized name or ZString that will be displayed in the menu
   The item tagged "menu" specifies the menu in which the command will appear: generate, automate, scripts, or filter
   The item tagged "enableinfo" specifies the conditions under which the command will be enabled. Too complex to describe here; see plugin sdk. Should usually just be "true", and your command should report a user-comprehensible error when it can't handle things. The problem with disabling the command when it's unsuitable is that there's no hint to the user as to why a command is disabled.
   The item tagged "about" specifies the localized text or ZString to be displayed in the about box for the plugin. Optional.
   The item tagged "eventid" needs to be a guaranteed unique string for your plugin. Usually generated with a UUID generator like uuidgen on MacOS
   
   You also need to set the value of the pluginName variable below to match the name of your plugin as the Generator process knows it.
   
   Do not change the values "name", or "generateAssets" in the code below.

*/

var pluginName = "assets";

// enable double clicking from the Macintosh Finder or the Windows Explorer
#target photoshop

// debug level: 0-2 (0:disable, 1:break on error, 2:break at beginning)
$.level = 0;
//debugger; // launch debugger on next line

// on localized builds we pull the $$$/Strings from a .dat file, see documentation for more details
$.localize = true;

var gScriptResult;

// the main routine
try { 
	var generatorDesc = new ActionDescriptor();
	generatorDesc.putString (app.stringIDToTypeID ("name"), pluginName);
	var returnDesc = executeAction( app.stringIDToTypeID ("generateAssets"), generatorDesc, DialogModes.NO );
}
// In case anything goes wrong.
catch( e ) {
    gScriptResult = 'cancel';
}

