# Solo's Mobile App (iOS & Android)
Welcome to solo mobile app repo!  This README will help you get your environment setup to serve/build the project and provides general project gotchas, no-nos and boo-boos.

* [Serving App Through Browser](Serving-App-Through-Browser)
    1. [Environment Setup for Browser Serving](#Environment-Setup-for-Browser-Serving)
    2. [Serve App in Browser](#Serve-App-in-Browser)
* [Building A Development Version of the App on iOS and/or Android](Building-A-Development-Version-of-the-App-on-iOS-and/or-Android)
    * Android
        1. [Environment Setup for Android](#Environment-Setup-for-Android)
        2. [Build App on Android](#Build-App-on-Android)
    * iOS
        1. [Environment Setup for iOS](#Environment-Setup-for-iOS)
        2. [Build App on iOS](#Build-App-on-iOS)
            * [Build App on Xcode Emulator](#Build-App-on-Xcode-Emulator)
            * [Build App on Device](#Build-App-on-Device)
* [Environment Options](#Environment-Options)
* [Update, remove and add cordova platforms and plugins for all brands](Update,-remove-and-add-cordova-platforms-and-plugins-for-all-brands)
    * [Read before updating, removing or adding platforms/plugins](#read-before-updating,-removing-or-adding-platforms/plugins)
    * [Plugins: update, add and remove](#Plugins:-update,-add-and-remove)
    * [Platforms: update, add and remove](#Platforms:-update,-add-and-remove)
* [Adding a new brand](#Adding-a-new-brand)
    1. [Project prerequisites](#project-prerequisites)
    2. [Setting up the project directory](#set-up-the-project-directory)
    3. [Setting up the stores](Setting-up-the-stores)

### Serving App Through Browser
Serving the app using a browser is useful for rapid development and testing however most cordova plugins do not work unless the app is running on a supported platform (e.g. iOS, android, etc).  Instructions on how to setup your environment for serving and how to serve are below:
1. [Environment Setup for Browser Serving](#Environment-Setup-for-Browser-Serving)
2. [Commands & Options for Browser Serving](#plugins:-update,-add-and-remove)

#### Environment Setup for Browser Serving
NOTE 1: Skip any step that you already have done.
NOTE 2: This setup assumes you already have node, npm and nvm installed

1. cloned project dir & cd into root
2. TODO: get environment vars file `.env`
3. install `gulp`, `bower` and `cordova` globally then intall all bower and npm modules:
  ```bash
  npm install -g gulp bower cordova@6.5.0; npm install; bower install;
  ```

#### Serve App in Browser
Once your environment is set up you should be set to serve the app using a browser on you machine.  Below is the command and options to serving the app using a specific brand pointing to an environment.

basic command to serve app:
```bash
gulp watch
```

* defaults for all build options are used when only `gulp watch` is ran so under the hood what is actually ran is `gulp watch --env=stage`
* for info on brand and api environment options view: [Environment Options](#Environment-Options)

### Building A Development Version of the App on iOS and/or Android
Building the app on a specific platform is useful for testing cordova plugins and platform specific nuances/issues.  Instructions on how to setup your environment for building on iOS & Android and commands & options used are below:

Android
1. [Environment Setup for Android](#Environment-Setup-for-Android)
2. [Build App on Android](#Build-App-on-Android)

iOS
1. [Environment Setup for iOS](#Environment-Setup-for-iOS)
2. [Build App on iOS](#Build-App-on-iOS)
3. [Build-.ipa](#Build-.ipa)

NOTE: for any further help use ionic [mac setup](https://ionicframework.com/docs/developer-resources/platform-setup/mac-setup.html)

#### Environment Setup for Android
NOTE 1: The environment setup for android requires the [Environment Setup for Browser Serving](#Environment-Setup-for-Browser-Serving) to be completed
TODO: worth noting that the app can be build for android on a machine using a simulator (similar to Xcode with iOS), place instructions on how to do so here...

1. download & install [Android Studios](https://developer.android.com/studio/index.html)
    1. make sure Android SDK build-tools, Android Support Repository & all android SDKs are installed
    2. open Android Studios and open SDK manager (sdk manager is under the Configuration tab)
    3. add all SDK Platforms that are needed and click OK or Apply (we add Android 4.0(IceCreamSandwich) and above)
    4. add Android Platform-Tools
    5. add Android SDK build-tools version 19.1.0 or higher
    6. add Android Support Repository (found under “Extras”)
2. add android platform and all plugins in config.xml
    1. if not already created, create a `www` dir
    2. run `cordova platform add android --nosave`
3. set up "Developer Mode" on android device
    * setting up developer mode on most android devices can be done by following the step below however the device you are using might require different steps.  If the steps below don't work.. google is your friend
    * Go to Settings -> General -> About Phone -> scroll and select Software information -> scroll and find Build Number. Rapidly tap on 'Build Number' 6 times and you should see the message 'You are now a developer!' The critical thing is to get to 'Build number', and then tap rapidly until you see the message.
4. install [android jdk 8](http://www.oracle.com/technetwork/java/javase/downloads/jdk8-downloads-2133151.html)
5. install [gradle] `brew install gradle`
6. add the following to your bash_profile  
    * `PATH="${PATH}:${HOME}/Library/Android/sdk/tools:${HOME}/Library/Android/sdk/platform-tools"`
    * `export JAVA_HOME=$(/usr/libexec/java_home)`
    * `export GRADLE_HOME=/Library/gradle/gradle-3.2`
    * `export PATH=$PATH:$GRADLE_HOME/bin`

#### Build App on Android
Once your environment is set up you should be set to build a development version of the app using an android device.  Below are the commands and options to serving the app using a specific brand pointing to an environment.

* connect android device to machine
* in chrome navigate to [chrome://inspect/#devices](chrome://inspect/#devices) to view debugger console
* basic command to build and run app: `gulp --cordova="run android"`
    * NOTE: defaults for all build options are used when only `gulp --cordova="run android"` is ran so under the hood what is actually ran is `gulp --cordova="run android" --env=stage`, for info on brand and api environment options view: [Environment Options](#Environment-Options)

#### Environment Setup for iOS
NOTE 1: The environment setup for iOS requires the [Environment Setup for Browser Serving](#Environment-Setup-for-Browser-Serving) to be completed

1. download & install [Xcode](https://developer.apple.com/xcode/)
2. add iOS platform and all plugins in config.xml
    1. if not already created, create a `www` dir
    2. run `cordova platform add ios --nosave`

#### Build App on iOS
Once your environment is set up you should be set to build a development version of the app using an iOS device and/or the Xcode emulator.  Below are steps to build the app:

1. Setup Xcode Profiles needed for building app:
    * if no account added Xcode:
        * in Xcode -> Preference -> Accounts -> click "+" -> Apple Id -> add apple id associated with Solo Profiles
    * in Xcode -> Preference -> Accounts -> Click "Download Manual Profiles"
2. basic command to build iOS app: `gulp --cordova="build ios"`
    * NOTE: defaults for all build options are used when only `gulp --cordova="build ios"` is ran so under the hood what is actually ran is `gulp --cordova="build ios" --brand=solo --env=stage`, for info on brand and api environment options view: [Environment Options](#Environment-Options)

##### Build App on Xcode Emulator
1. open app in Xcode
    * if first time opening project in Xcode: open Xcode -> select "Open another project" -> naviagte to `mobile/projects/BRAND_DIR/platforms/ios/` -> choose the .xcworkspace
2. in Xcode select device to emulate and click "Build"/"Play" button
3. if not done: fix the "missing icon" warning drag ios main icon for project `project/BRAND_DIR/resources/ios/icon.png` into

##### Build App on Device
1. connect iOS device
2. open app in Xcode
    * if first time opening project in Xcode: open Xcode -> select "Open another project" -> naviagte to `mobile/projects/BRAND_DIR/platforms/ios/` -> choose the .xcworkspace
3. in Xcode select connected device from "Device Options"
4. click "Build"/"Play" button
    1. if code signing error is thrown follow prompt to select "Team Solo Inc."
    2. underneath code signing select ~"Add Device" so that device is added to devices approved for development
5. if not done: fix the "missing icon" warning by using `project/BRAND_DIR/resources/ios/icon.png`

##### Build .ipa
useful for uploading test versions to hockeyapp
* `gulp --cordova="build ios --device"`

### Environment Options
Below are the options available when serving and building the app:

* option to select env from `monile/app/config/BRAND_NAME/env-ENVIRONMENT_NAME.json` you want to run: `--env=ENVIRONMENT`
  - Default env is `stage`
  - Example: `gulp --cordova="build ios" --env=stage`
  - Example: `gulp watch --env=prod`
* NOTE: when only `gulp --cordova="build ios"` is ran defaults for all options are used so under the hood w hat is actually ran is `gulp --cordova="build ios" --env=stage`

## Update, remove and add cordova platforms and plugins for all brands
* [Read before updating, removing or adding platforms/plugins](#read-before-updating,-removing-or-adding-platforms/plugins)
* [Plugins: update, add and remove](#Plugins:-update,-add-and-remove)
* [Platforms: update, add and remove](#Platforms:-update,-add-and-remove)

##### Read before updating, removing or adding platforms/plugins
When updating, removing or adding cordova platforms and plugins there are three primary things to keep in mind:
1. Adding, removing and updating platforms and plugins must be done on a project bases given that each project has it's own config.xml, resource & plugins dir
2. The platforms & plugins that a project has and the versions of said platforms and plugins should be in sync whenever possible to reduce issues cased by inconsistent environments.
3. Changes to the config.xmls must be kept to the delta that adding, removing or updating platforms/plugins causes and not include solely stylistic and/or re-arranges in the config.xml element structure.
  - Explanation: Adding, removing and updating platforms using the `cordova` CLI without the `--nosave` command reconstructs the config.xml with a new format every time.  The reconstructed config.xml delta is only the added, removed or updated platform/plugin however as of cordova@7.x.x almost all of the config.xml's elements get re-arranged which makes reviewing PR's and `git diff config.xml` difficult. To reduce the headaches caused by the cordova cli re-structuring, very specific steps have been outlined below for adding, removing and updating platforms/plugins.

PS: One of cordovas newest version might fix the config.xml re-structuring.  If that is the case plugins and platforms should be added using only the cordova cli as is common.

##### Plugins: update, add and remove
* Update cordova plugins
  - change version number of plugin in project config.xml to desired plugin version and save config.xml
    - `<plugin name="cordova-plugin-name" spec="0.0.1" />` ->
    - `<plugin name="cordova-plugin-name" spec="0.0.2" />`
  - run `cordova plugin remove CORDOVA-PLUGIN-NAME --nosave; cordova plugin add CORDOVA-PLUGIN-NAME --nosave`
* Delete cordova plugins
  - remove plugin xml element in project config.xml and save
  - run `cordova plugin remove CORDOVA-PLUGIN-NAME --nosave`
* Add cordova plugins
  - copy and paste config.xml to new temporary file temp-config.xml
  - run `cordova plugin add CORDOVA-PLUGIN-NAME`
  - copy newly added plugin element and any children:
    - `<plugin name="CORDOVA-PLUGIN-NAME" spec="x.x.x" /> ... </plugin>`
  - paste copied plugin into temp-config.xml below last plugin element
  - copy and past temp-config.xml in to config.xml
  - run `git diff config.xml` to make sure only new plugin was added to config.xml

##### Platforms: update, add and remove
  * Update cordova platform
    - change version number of platform in project config.xml to desired platform version and save config.xml
      - `<engine name="ios" spec="0.0.1" />` ->
      - `<engine name="ios" spec="0.0.2" />`
    - run `cordova platform remove CORDOVA_PLATFORM --nosave; cordova platform add CORDOVA_PLATFORM --nosave`
  * Delete cordova platform
    - remove platform xml element in project config.xml and save
    - run `cordova platform remove CORDOVA_PLATFORM --nosave`
  * Add cordova platform
    - copy and paste config.xml to new temporary file temp-config.xml
    - run `cordova platform add CORDOVA_PLATFORM`
    - copy newly added platform element:
      - `<engine name="CORDOVA_PLATFORM" spec="x.x.x" />`
    - paste copied platform into temp-config.xml below last `<engine>` element
    - copy and past temp-config.xml in to config.xml
    - run `git diff config.xml` to make sure only new platform was added to config.xml


## Adding a new brand
Adding a new brand is broken up into the following steps:

1. [Project prerequisites](#project-prerequisites)
2. [Setting up the project directory](#set-up-the-project-directory)
3. TODO: [Setting up the stores](Setting-up-the-stores)

##### Project prerequisites
All new projects will need a variety of copy, images and values that are used while setting up the cordova platforms and plugins.  

Below is a list of all the prerequisites needed from product:
* app splash screen images
    - specs: we can use ionic services to generate all needed splash imgs as long as a base splash img of at least (2732 x 2732px) that is a (.png, .psd, or .ai) is provided.
    - [what is it](https://appsamurai.com/mobile-app-splash-screens-how-to-get-it-right/)
    - [docs](https://cordova.apache.org/docs/en/latest/reference/cordova-plugin-console/index.html)
* iOS & android icon images
    - specs: two imgs of the app icon are needed to generate icons for iOS and android.  The iOS icon should not have a border radius (0px). The android icon should have a boarder radius (TODO get exact boarder radius).  we can ionic services to generate all needed icon imgs for all devices for both platforms using ionic services as long as a base icon img of at least (1024 x 1024px) that is a (.png, .psd, or .ai) is provided.
    - [what is it](https://applypixels.com/how-to-design-better-app-icons/)
    - [docs](https://cordova.apache.org/docs/en/latest/config_ref/images.html)
* (app) name
    - what is it: name under app icon
    - [docs](https://cordova.apache.org/docs/en/latest/config_ref/#name)
* (app) author
    - [docs](https://cordova.apache.org/docs/en/latest/config_ref/#author)
* (app) author email
    - [docs](https://cordova.apache.org/docs/en/latest/config_ref/#author)
* (app) author website
    - [docs](https://cordova.apache.org/docs/en/latest/config_ref/#author)

Below is the list of prerequisites needed from engineering:
* config.xml widget `id` attribute value
    - [docs](http://cordova.apache.org/docs/en/7.x/config_ref/index.html#widget)
* cordova-plugin-customurlscheme variable name="URL_SCHEME" value
    - [docs]()

##### Set up the project directory
1. Set up the config.xml
    1. Copy a config.xml from any of the other projects and paste it into the new project root dir
    2. Update the values for the following attributes inside the `widget` element:
        - `android-versionCode` set to `010`
        - `attribute version` set to `0.0.1`
    3. Update the values for the following attributes and elements (using the prerequisite data):
        - `widget` element `id` value
        - `name` element value
        - `author` element value
        - `author` element `email` attribute
        - `author` element `href` attribute
        - `plugin` element with attribute name set to `cordova-plugin-customurlscheme` > `variable` element with attribute set to `URL_SCHEME` value attribute
2. Create a `www` dir at root of the project dir
3. Create a `resources` dir at root of the project dir and populate with splash and icon assets
    - TODO outline `resources` dir structure
4. Stage the project using `git`
    - Note: staging is done to make sure we can check the delta when we add the platforms
5. Add cordova iOS and andriod platforms
    - Run the command bellow at the root of the project:
    `cordova platform add ios --nosave; cordova platform add android --nosave`
    - Note: the `--nosave` flag is used so that the config.xml isn't reconstructed, which make it difficult to check the net delta of the config.xml
6. Reset cosmetic config.xml changes:
    - Run the command bellow at the root of the project:
    - `git checkout -- config.xml`

##### Setting up the stores
TODO

## Final side notes
This project was generated with Generator-M-Ionic v1.5.0. For more info visit the [repository](https://github.com/mwaylabs/generator-m-ionic) or check out the README below.

## Quick Start
- [Quick Start](https://github.com/mwaylabs/generator-m-ionic/blob/master/docs/intro/quick_start.md) for the experienced developer.
- [Try the demo](https://github.com/mwaylabs/generator-m-ionic-demo). Get a quick impression by cloning the sample project generated with the latest version of Generator-M-Ionic.

# Config Files
Add these files:
- `app/config/config.constant.js`
- `app/config/env-dev.json`
