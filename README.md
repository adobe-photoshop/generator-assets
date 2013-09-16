## Image Asset Generation Plug-in for Generator (with Android dp support)

This fork includes the support for the Android "dp" unit, i.e. it creates images for different screen densities in the corresponding "drawable-" directories.

### Installation
Choose one of the following methods to get it working:

- Deploy into Photoshop:
  - Download the [zip file](https://github.com/jimulabs/generator-assets/releases/tag/android-1.0.1)
  - Extract it into `/Applications/Adobe Photoshop CC/Plug-ins/Generator/` (Mac), or `Program Files/Adobe Photoshop CC/Plugin-ins/Generator...` on Windows.
    - the resulting directory is `/Applications/Adobe Photoshop CC/Plug-ins/Generator/generator-assets-android.generate`
  - Re-launch Photoshop
- Development mode: follow the tutorial [here](http://tomkrcha.com/?p=3896) and run `npm install` inside the directory `generator-assets`. 

### Usage
Change the name of a layer or layer group to something like `20x20dp ic_ab_search.png`, you'll get:
![screenshot](https://raw.github.com/jimulabs/generator-assets/master/generated_dirs_screenshot.png)

Below is the README in the [original repo](https://github.com/adobe-photoshop/generator-assets)


## Image Asset Generation Plug-in for Generator [![Build Status](https://travis-ci.org/adobe-photoshop/generator-assets.png?branch=master)](https://travis-ci.org/adobe-photoshop/generator-assets)

This repository contains a plug-in for Adobe Photoshop CC's Generator extensibility layer. This plug-in makes it easier for users to export image assets from their Photoshop files. Users simply enable image asset generation for a document and name layers (or layer groups, or smart objects) they want exported using a filename-like syntax. Generator then watches these layers, and any time they change, automatically updates the corresponding assets on disk.

To learn more about Generator and creating your own Generator plug-ins, please visit the [Generator Core repo](https://github.com/adobe-photoshop/generator-core).

### Usage

The [Functional Spec](https://github.com/adobe-photoshop/generator-assets/wiki/Generate-Web-Assets-Functional-Spec)
provides basic information about how to use the Image Assets plug-in.
Another good source of information is Samartha Vashishtha's blog post
[A closer look at the Photoshop Generator syntax](http://blogs.adobe.com/samartha/2013/09/a-closer-look-at-the-photoshop-generator-syntax.html).

### License

(MIT License)

Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the "Software"),
to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
