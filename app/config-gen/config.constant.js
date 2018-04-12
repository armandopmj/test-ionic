(function() {
    'use strict';

    angular
        .module('solo.config', [])
        .constant('Config', {

            // gulp environment: injects environment vars
            ENV: {
                /*inject-env*/
                'SERVER_URL': 'https://solo-server.herokuapp.com',
    'VERSION': '0.0.30',
    'FB_API_KEY': 'AIzaSyDkTCy6UMy2iBqrPKRuvSmmjGsiG9ISJ4g'
                /*endinject*/
            },

            // gulp build-vars: injects build vars
            BUILD: {
                /*inject-build*/
                /*endinject*/
            }
        });
})();
