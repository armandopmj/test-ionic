(function() {
    angular
    .module('solo.constants', [])
    .constant('statuses', {
        searched: {
            callToAction: 'Call',
            confirmation: 'Ready to call shipper about the load?',
            explanation: 'Your search found this load.',
            nextStatus: 'called',
        },
        called: {
            callToAction: 'Book load',
            confirmation: 'Only book this load if you called the shipper and agreed on receiving a Rate Confirmation.',
            explanation: 'You called about this load.',
            nextStatus: 'booked',
            previousStatus: 'searched',
        },
        booked: {
            explanation: 'Waiting to receive RC…',
            nextStatus: 'signedRc',
            previousStatus: 'called',
        },
        signedRc: {
            callToAction: 'Arrive at pickup',
            confirmation: 'Have you arrived and are you ready to pick up the load?',
            explanation: 'RC received and signed, completing booking.',
            nextStatus: 'arrivedAtOrigin',
            previousStatus: 'booked',
        },
        arrivedAtOrigin: {
            callToAction: 'Load the load',
            confirmation: 'Is everything ready for loading?',
            explanation: 'Arrived at pick up location.',
            nextStatus: 'pickedUp',
            previousStatus: 'signedRc',
        },
        pickedUp: {
            callToAction: 'Arrive at destination',
            confirmation: 'Have you arrived and are you ready to drop off the load?',
            explanation: 'Picked up load.',
            nextStatus: 'arrivedAtDestination',
            previousStatus: 'arrivedAtOrigin',
        },
        arrivedAtDestination: {
            callToAction: 'Unload the load',
            confirmation: 'Is everything ready for unloading?',
            explanation: 'Arrived at drop off location.',
            nextStatus: 'droppedOff',
            previousStatus: 'pickedUp',
        },
        droppedOff: {
            callToAction: 'Upload bill of lading',
            confirmation: 'Make sure you have uploaded <b>ALL</b> pages of the bill of lading.',
            explanation: 'Dropped off load.',
            nextStatus: 'uploadedBol',
            previousStatus: 'arrivedAtDestination',
        },
        uploadedBol: {
            explanation: 'Verifying BoL upload for legibility…',
            previousStatus: 'droppedOff',
        },
        verifiedBol: {
            explanation: 'Initiating payment…',
            previousStatus: 'uploadedBol',
        },
        paid: {
            explanation: 'Paid.',
            previousStatus: 'verifiedBol',
        },
        cancelled: {
          previousStatus: 'signedRc', // so user doesn't have to re-enter rate if already done.
          explanation: 'Load was cancelled.'
        },
    })
    .service('updateStatus', function (statuses, $ionicPopup, $window, $state, calledLoadsService) {
        return function updateStatus (modalScope, load, user, cancelConfirmation) {
            var status = statuses[load.status];
            if (cancelConfirmation) {
              status.confirmation = cancelConfirmation;
              status.callToAction = 'cancel load';
              status.nextStatus = 'cancelled';
            }
            return new Promise(function (resolve, reject) {
                var template, templateUrl;
                if (status.nextStatus === 'called') {
                    templateUrl = 'main/states/loads/call.html';
                } else if (status.nextStatus === 'booked') {
                    templateUrl = 'main/states/loads/book.html';
                } else {
                    template = '<h4>' + status.confirmation || cancelConfirmation + '</h4>';
                }
                function onTap (e) {
                    if (status.nextStatus === 'called') {
                      if (!user) { throw new Error({message: 'no user', user: user}); } // TODO reject rather than throw?
                      user.post('loads', load.plain()).then(function(data) {
                          calledLoadsService.addNewlyCalledLoadToCache(_.extend(load, data.pop()));
                      }).then(resolve.bind(0, status.nextStatus)).catch(reject);
                    } else if (status.nextStatus === 'booked' && validateBooking(modalScope.rate.expected)) {
                      e.preventDefault();
                      return;
                    } else if (status.nextStatus === 'booked') {
                      user.one('loads', load.id).patch({status: status.nextStatus, rateExpected: modalScope.rate.expected})
                      .then(resolve.bind(0, status.nextStatus)).catch(reject);
                    } else if (status.nextStatus === 'uploadedBol') {
                      // TODO why not top.main.loads.load.bill-of-lading ?
                      $state.go('top.main.loads.load.details', {loadType: 'dashboard', loadId: load.id});
                    } else {
                      load.patch({status: status.nextStatus, rateExpected: modalScope.rate.expected})
                      .then(resolve.bind(0, status.nextStatus)).catch(reject);
                    }
                    modalScope.close();
                }
                var modal = $ionicPopup.show({
                    title: 'Confirm ' + status.callToAction.toLowerCase(),
                    template: template,
                    templateUrl: templateUrl,
                    scope: modalScope,
                    buttons: status.nextStatus === 'called' ? [] : [
                      { text: 'Cancel' },
                      {
                        text: status.callToAction,
                        type: 'button-positive',
                        onTap: onTap
                    }]
                });
                modalScope.close = modal.close;
                modalScope.onTap = onTap;
                modalScope.rate = {expected: null, validate: validateBooking};
            });
        };

        function validateBooking(rateExpected){
          if (!rateExpected) { return 'Agreed upon rate is required'; }
          else if (rateExpected < 10 || rateExpected > 10000){ return 'Rate must be between $10 - $10,000'; }
        }
    });
})();

'use strict';
angular.module('solo', [
    // Ionic modules
    'ionic',
    'ngCordova',
    'ngMessages',
    'ionic-datepicker',

    // Third party modules
    'ui.router',
    'ng-token-auth',
    'angularMoment',
    'angular-ladda',
    'pdf',
    'ngStorage',
    'ngCropper',
    'ui.utils.masks',

    // Solo modules
    'solo.auth',
    'solo.loads',
    'solo.resources',

    'solo.components.validation',
    'solo.config'
]);

(function() {
    'use strict';

    angular
        .module('solo')
        .controller('WarningCtrl', WarningCtrl);

    function WarningCtrl($sce, $state, $scope, $ionicModal, warning) {
        var vm = this;
        vm.body = $sce.trustAsHtml(warning.body);
        vm.title = warning.title;

        $ionicModal.fromTemplateUrl('main/components/modals/modal-warning.html', {
            scope: $scope,
            animation: 'slide-in-up'
        }).then(function(modal) {
            vm.modal = modal;
            modal.show();
        });
    }
})();

(function() {
    'use strict';

    angular
        .module('solo')
        .constant('nonReloadRoutes', {
            'top.main.transaction.details': true
        })
        .controller('StateReloadCtrl', StateReloadCtrl);

    function StateReloadCtrl($stateParams, $state, $ionicHistory, $timeout) {
        var vm = this;
        vm.goToState = $stateParams.goToState;
        $timeout(function(){
            $ionicHistory.clearCache().then(function(){
                $ionicHistory.nextViewOptions({disableAnimate: true});
                $state.go($stateParams.goToState);
            });
        }, 100);
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads', []);
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .factory('searchService', searchService);

    function searchService(paginationDefaults, equipmentTypesCollection, loadTypesCollection) {
        var service = {
            getSearchData: getSearchData,
            sanitizeDataIntoSearchParams: sanitizeDataIntoSearchParams
        };
        return service;

        ////////////

        function getSearchData() {
            var data = {
                dateRange: {
                    from: moment(Date.now()),
                    to: moment(Date.now()).add(1, 'days')
                },
                origin: {
                    miles: null,
                    city: null,
                    state: null
                },
                destinations: [{type: 'merica'}],
                equipmentTypes: equipmentTypesCollection,
                loadType: loadTypesCollection.full,
                limit: paginationDefaults.limit,
                index: paginationDefaults.index
            };
            return data;
        }
        function sanitizeDataIntoSearchParams(data){
            var params = {
              trailerTypes: data.equipmentTypes.filter(function (et) { return et.isActive; }).map(function (et) { return et.value; }), // 'Flatbeds', 'Reefers', 'Vans, Standard'
              originMiles: data.origin.miles, // an integer greater than or equal to zero eg 150
              originCity: data.origin.city, // a US city name (non-empty string) eg 'Portland'
              originState: data.origin.state, // a US state code (two-letter string) eg 'OR'
              originRegion: data.origin.region, // one of 'New England', 'North East', 'Mid-Atlantic', 'South East', 'Mid-West', 'North Central', 'Central', 'South', 'Mountain', 'West', 'Contiguous USA'
              destinations: data.destinations.filter(function (d) { return d.type !== 'merica'; }).map(function (d) { return {
                destinationMiles: d.miles, // an integer greater than or equal to zero eg 150
                destinationCity: d.city, // a US city name (non-empty string) eg 'Portland'
                destinationState: d.state, // a US state code (two-letter string) eg 'OR'
                destinationRegion: d.region,
              };}),
              index: data.index,
              limit: data.limit,
              dateFrom: data.dateRange.from.format('YYYY-MM-DD'),
              dateTo: data.dateRange.to.format('YYYY-MM-DD'),
              loadType: data.loadType.value.toLowerCase()
            };
            return params;
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .controller('SearchCtrl', SearchCtrl);

    function SearchCtrl($scope, $log, $ionicModal, $state, paginationDefaults, loadTypesCollection, statesCollection, milesCollection, searchService, equipmentService, originService, destinationService, datePickerService, loadTypesService, loadsService, Loads, data) {
        var vm = this;
        vm.data = data;
        vm.states = statesCollection;
        vm.milesOptions = milesCollection;
        vm.loadTypes = Object.values(loadTypesCollection);
        vm.openLoadTypesPopup = loadTypesService.openLoadTypesPopup.bind(null, $scope);
        vm.openEquipmentTypePopup = equipmentService.openEquipmentTypePopup.bind(null, $scope);
        vm.isActive = function (equipmentType) { return equipmentType.isActive === true; };
        vm.openOriginModal = originService.openOriginModal.bind(null, $scope);
        vm.openDestinationModal = destinationService.openDestinationModal.bind(null, $scope);
        vm.openSearchDatePicker = datePickerService.openSearchDatePicker;
        vm.submit = submit;
        // watch changes on required fields
        $scope.$watch('vm.data', validateSearchForm, true);

        function validateSearchForm(newData, oldData) {
            if (newData !== oldData) {
                if (newData.equipmentTypes.filter(vm.isActive).length > 0 && newData.origin.city && newData.dateRange.from && newData.dateRange.to && newData.destinations.length && vm.data.loadType) {
                    vm.allDataIsFilled = true;
                }
                else {
                    vm.allDataIsFilled = null;
                }
            }
        }
        function submit(){
            // HACK: The form directive does not re-init when going search -> results -> search so force
            // vm.from.loading to true on every submit
            vm.form.loading = true;
            vm.data.index = 0;
            Loads.getList(searchService.sanitizeDataIntoSearchParams(vm.data)).then(function(loads) {
                loadsService.searchedLoads = loads;
                vm.form.setSuccess();
                $state.go('top.main.loads.list', {filters: JSON.stringify(_.assign(vm.data, {index: vm.data.index + vm.data.limit}))});
            }, vm.form.setFlashValidity);
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .constant('paginationDefaults', {
            index: 0,
            limit: 5,
        });
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .factory('originService', originService);

    function originService($ionicModal) {
        var service = {
            openOriginModal: openOriginModal
        };
        return service;

        ////////////
        // public

        function openOriginModal($scope) {
            $ionicModal.fromTemplateUrl('main/states/loads/search/origin/origin.html', {
                scope: $scope,
                animation: 'slide-in-up'
            }).then(function(originModal) {
                $scope.vm.originModal = originModal;
                $scope.vm.originModal.show();

                $scope.vm.submitOrigin = function(){
                    if ($scope.vm.formOrigin.$invalid) {
                        return;
                    }
                    $scope.vm.originModal.hide();
                };
                $scope.vm.cancelOrigin = function(){
                    if (!$scope.vm.data.origin.state || !$scope.vm.data.origin.miles || !$scope.vm.data.origin.city) {
                        $scope.vm.data.origin = { miles: null, city: null, state: null };
                    }
                    $scope.vm.originModal.hide();
                };

                // Cleanup the modal when we're done with it!
                $scope.$on('$destroy', function() {
                    if ($scope.vm.originModal) {
                        $scope.vm.originModal.remove();
                    }
                });
            });
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .factory('loadTypesService', loadTypesService);

    function loadTypesService($ionicPopup) {
        var service = {
            openLoadTypesPopup: openLoadTypesPopup
        };
        return service;

        ////////////
        // public

        function openLoadTypesPopup($scope) {
            $scope.vm.tempSelectedLoadType = $scope.vm.data.loadType;
            return $ionicPopup.show({
                templateUrl: 'main/states/loads/search/load-types/load-types.html',
                title: 'Load Size',
                scope: $scope,
                buttons: [{
                    text: 'Cancel',
                }, {
                    text: '<b> Save </b>',
                    type: 'button-positive',
                    onTap: function() {
                        $scope.vm.data.loadType = $scope.vm.tempSelectedLoadType;
                        return true;
                    }
                }]
            });
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .factory('equipmentService', equipmentService);

    function equipmentService($ionicPopup) {
        var service = {
            openEquipmentTypePopup: openEquipmentTypePopup
        };
        return service;

        ////////////
        // public

        function openEquipmentTypePopup($scope) {
            return $ionicPopup.show({
                templateUrl: 'main/states/loads/search/equipment/equipment.html',
                title: 'Equipment Type',
                scope: $scope,
                buttons: [{
                    text: 'Cancel',
                }, {
                    text: '<b> Save </b>',
                    type: 'button-positive',
                    onTap: function() {
                        return true;
                    }
                }]
            });
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .factory('destinationService', destinationService);

    function destinationService($ionicModal, $timeout) {
        var service = {
            openDestinationModal: openDestinationModal
        };
        return service;

        ////////////
        // public

        function openDestinationModal($scope) {
            $ionicModal.fromTemplateUrl('main/states/loads/search/destination/destination.html', {
                scope: $scope,
                animation: 'slide-in-up'
            }).then(function(destinationModal) {
                $scope.vm.destinationModal = destinationModal;
                $scope.vm.destinationModal.show();

                $scope.vm.modalDestinations = angular.copy($scope.vm.data.destinations);
                $scope.vm.addStateDestination = addStateDestination;
                $scope.vm.addRadiusDestination = addRadiusDestination;
                $scope.vm.addMericaDestination = addMericaDestination;
                $scope.vm.removeDestination = removeDestination;
                $scope.vm.cancelDestination = cancelDestination;
                $scope.vm.submitDestination = submitDestination;

                function submitDestination(){
                    var completeDestinations = $scope.vm.modalDestinations.filter(function(destination){
                        return isDestinationComplete(destination);
                    });
                    if (completeDestinations.length === 0) {
                        displayNoCompletedDestinationError();
                        return;
                    }
                    $scope.vm.data.destinations = completeDestinations;
                    $scope.vm.destinationModal.hide();

                    function displayNoCompletedDestinationError(){
                        $scope.vm.formDestination.noCompeleDestinations = 'One Complete Destination Required';
                        $timeout(function() {
                            $scope.vm.formDestination.noCompeleDestinations = false;
                        }, 8000);
                    }
                }
                function cancelDestination(){
                    $scope.vm.destinationModal.hide();
                }
                function addStateDestination(){
                    if ($scope.vm.modalDestinations.length === 5){
                        displayMaxDestinationsAddedError();
                        return;
                    }
                    removeMericaFromDestinations();
                    $scope.vm.modalDestinations.push({ type: 'state', state: null });
                }
                function addRadiusDestination(){
                    if ($scope.vm.modalDestinations.length === 5){
                        displayMaxDestinationsAddedError();
                        return;
                    }
                    removeMericaFromDestinations();
                    $scope.vm.modalDestinations.push({ type: 'radius', miles: null, city: null, state: null });
                }
                function isDestinationComplete(destination){
                    if (destination.type === 'radius'){
                        return destination.miles && destination.city && destination.state;
                    }
                    else if (destination.type === 'state'){
                        return destination.state;
                    }
                    else if (destination.type === 'merica') {
                        return true;
                    }
                }
                function addMericaDestination(){
                    $scope.vm.modalDestinations = [];
                    $scope.vm.modalDestinations.push({ type: 'merica' });
                }
                function removeDestination(indexToRemove){
                    $scope.vm.modalDestinations = $scope.vm.modalDestinations.filter(function(destination, index){
                        return indexToRemove !== index;
                    });
                }
                function removeMericaFromDestinations(){
                    if ($scope.vm.modalDestinations.length === 1 && $scope.vm.modalDestinations[0].type === 'merica') {
                        $scope.vm.modalDestinations.pop();
                    }
                }
                function displayMaxDestinationsAddedError(){
                    $scope.vm.maxDestinationsError = 'Only 5 destinations allowed';
                    $timeout(function() {
                        $scope.vm.maxDestinationsError = false;
                    }, 8000);
                }

                // Cleanup the modal when we're done with it!
                $scope.$on('$destroy', function() {
                    if ($scope.vm.destinationModal) {
                        $scope.vm.destinationModal.remove();
                    }
                });
            });
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .factory('loadsService', loadsService);

    function loadsService(userService) {
        var service = {
            getAndCacheCompletedLoads: getAndCacheCompletedLoads,
            getAndCacheActiveLoads: getAndCacheActiveLoads,
            userLoads: [], // DON'T LOSE REF!
            searchedLoads: [], // DON'T LOSE REF!
            completedLoads: [], // DON'T LOSE REF!
            addLoadsToUserLoads: addLoadsToUserLoads,
            addLoadsToSearchedLoads: addLoadsToSearchedLoads,
            addLoadsToCompletedLoads: addLoadsToCompletedLoads,
            getSearchLoadById: getSearchLoadById,
            getUserLoadById: getUserLoadById,
            getCompletedLoadById: getCompletedLoadById,
            initUserLoads: initUserLoads,
            initSearchedLoads: initSearchedLoads,
            initCompletedLoads: initCompletedLoads,
            getLoadByIdAndType: getLoadByIdAndType
        };
        return service;

        function getAndCacheCompletedLoads(user) {
            return user.getList('loads', userService.getLoadParamsForHistory()).then(function(loads){
                initCompletedLoads(loads);
                return service.completedLoads;
            });
        }

        function getAndCacheActiveLoads(user) {
            return user.getList('loads', userService.getLoadParamsForDashboard()).then(function(loads){
                initUserLoads(loads);
                return service.userLoads;
            });
        }

        function getLoadByIdAndType(id, loadType) {
            if (loadType === 'dashboard') {
                return getUserLoadById(id);
            }
            if (loadType === 'history') {
                return getCompletedLoadById(id);
            }
        }

        function getSearchLoadById(id) {
            return _.find(service.searchedLoads, function(load) {
                return load.id === id;
            });
        }

        function getUserLoadById(id) {
            return _.find(service.userLoads, function(load) {
                return load.id === id;
            });
        }

        function getCompletedLoadById(id) {
            return _.find(service.completedLoads, function(load) {
                return load.id === id;
            });
        }

        function addLoadsToUserLoads(loads) {
            _.forEach(loads, function(load) {
                service.userLoads.push(load);
            });
        }

        function addLoadsToSearchedLoads(loads) {
            _.forEach(loads, function(load) {
                service.searchedLoads.push(load);
            });
        }

        function addLoadsToCompletedLoads(loads) {
            _.forEach(loads, function(load) {
                service.completedLoads.push(load);
            });
        }

        function initUserLoads(loads) {
            while (service.userLoads.length) {
              service.userLoads.pop();
            }
            addLoadsToUserLoads(loads);
        }

        function initSearchedLoads(loads) {
            while (service.searchedLoads.length) {
              service.searchedLoads.pop();
            }
            addLoadsToSearchedLoads(loads);
        }

        function initCompletedLoads(loads) {
            while (service.completedLoads.length) {
              service.completedLoads.pop();
            }
            addLoadsToCompletedLoads(loads);
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .config(config);

    function config($stateProvider) {
        $stateProvider
            .state('top.main.loads', {
                // TODO: this is an abstract state, however leaving `abstract: true`
                //      causes a black screen for a split second during a transition to
                //      to any child state, currently no fix beyond removing `abstract: true`:
                //      https://forum.ionicframework.com/t/problem-with-transition-between-abstract-views/14402/7
                // abstract: true,
                url: '/loads',
                views: {
                    'pageContent': {
                        template: '<ion-nav-view></ion-nav-view>',
                    }
                }
            })
            .state('top.main.loads.list', {
                url: '/list:filters',
                templateUrl: 'main/states/loads/list/loads-list.html',
                controller: 'LoadsListCtrl',
                controllerAs: 'vm',
                params: {
                    filters: null,
                },
                resolve: {
                    filters: function($stateParams){
                        var filters = JSON.parse($stateParams.filters);
                        filters.dateRange.from = moment(filters.dateRange.from);
                        filters.dateRange.to = moment(filters.dateRange.to);
                        return filters;
                    },
                    loads: function(loadsService){
                        return loadsService.searchedLoads;
                    }
                }
            })
            .state('top.main.loads.history', {
                url: '/history',
                templateUrl: 'main/states/loads/history/load-history.html',
                controller: 'LoadHistoryCtrl',
                controllerAs: 'vm',
                onEnter: function($ionicHistory) {
                    $ionicHistory.clearHistory();
                    $ionicHistory.nextViewOptions({
                        disableBack: true
                    });
                },
                params: {
                    uploadedLoadId: null,
                },
                resolve: {
                    uploadedLoadId: function($stateParams){
                        return $stateParams.uploadedLoadId;
                    }
                }
            })
            .state('top.main.loads.called', {
                url: '/called',
                templateUrl: 'main/states/loads/list/loads-list.html',
                controller: 'LoadsListCtrl',
                controllerAs: 'vm',
                onEnter: function($ionicHistory) {
                    $ionicHistory.clearHistory();
                    $ionicHistory.nextViewOptions({disableBack: true});
                },
                resolve: {
                    filters: function(paginationDefaults) {
                        return _.assign({status: 'called'}, {limit: paginationDefaults.limit, index: paginationDefaults.index + paginationDefaults.limit});
                    },
                    loads: function(calledLoads) {
                        return calledLoads;
                    }
                }
            })
            .state('top.main.loads.search', {
                url: '/search',
                templateUrl: 'main/states/loads/search/search.html',
                controller: 'SearchCtrl',
                controllerAs: 'vm',
                resolve: {
                    data: function(searchService){
                        return searchService.getSearchData();
                    }
                },
                onEnter: function($ionicHistory) {
                    $ionicHistory.clearHistory();
                    $ionicHistory.nextViewOptions({
                        disableBack: true
                    });
                }
            })
            .state('top.main.loads.load', {
                // TODO: this is an abstract state, however leaving `abstract: true`
                //      causes a black screen for a split second during a transition to
                //      to any child state, currently no fix beyond removing `abstract: true`:
                //      https://forum.ionicframework.com/t/problem-with-transition-between-abstract-views/14402/7
                // abstract: true,
                template: '<ion-nav-view></ion-nav-view>',
                params: {
                    loadType: 'dashboard',
                    loadId: null,
                },
                resolve: {
                    load: function($stateParams, loadsService, activeLoads, completedLoads) {
                        // C:require activeLoads & completedLoads as dependencies so that cached loads are available during this resolve
                        return (activeLoads || completedLoads) ? loadsService.getLoadByIdAndType(Number($stateParams.loadId), $stateParams.loadType) : null;
                    }
                },
                url: '/:loadId'
            })
            .state('top.main.loads.load.details', {
                url: '/details',
                templateUrl: 'main/states/loads/details/load-details.html',
                controller: 'LoadDetailsCtrl',
                controllerAs: 'vm',
            })
            .state('top.main.loads.load.rate-confirmation', {
                url: '/rate-confirmation',
                templateUrl: 'main/states/loads/details/rate-confirmation/rate-confirmation.html',
                controller: 'RateConfirmationCtrl',
                controllerAs: 'vm',
                params: {
                    rateConfirmationUrl: null,
                },
                resolve: {
                    rateConfirmationUrl: function($stateParams){
                        return $stateParams.rateConfirmationUrl;
                    }
                }
            })
            .state('top.main.loads.load.bill-of-lading', {
                url: '/bill-of-lading',
                cache: false,
                templateUrl: 'main/states/loads/details/bill-of-lading/bill-of-lading.html',
                controller: 'BillOfLadingCtrl as vm',
                params: {
                    takePhoto: null,
                },
                resolve: {
                    takePhoto: function($stateParams) {
                        return $stateParams.takePhoto;
                    }
                }
            })
            .state('top.main.loads.load.bill-of-lading-cropper', {
                url: '/bill-of-lading-cropper',
                templateUrl: 'main/states/loads/details/bill-of-lading/img-cropper/img-cropper.html',
                controller: 'ImgCropperCtrl as vm',
                params: {
                    dataUrl: null
                },
                resolve: {
                    dataUrl: function($stateParams) {
                        return $stateParams.dataUrl;
                    }
                }
            })
        ;
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .constant('statusMessageLookup', {
            booked: 'Waiting for rate confirmation',
            signedRc: 'Load is ready for pickup',
            arrivedAtOrigin: 'Load is ready for pickup',
            pickedUp: 'Load is ready for drop-off',
            arrivedAtDestination: 'Load is ready for drop-off',
            droppedOff: 'Missing Bill of Lading',
            uploadedBol: 'Processing Bill Of Lading',
            verifiedBol: 'Waiting on Payment',
            paid: 'Completed and Paid',
            cancelled: 'Load was cancelled'
        });
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .controller('LoadsListCtrl', LoadsListCtrl);

    function LoadsListCtrl($scope, loads, filters, confirmCallService, confirmBookLoadService, searchService, calledLoadsService, /*From main resolve*/user ) {
        var vm = this;
        vm.loads = loads;
        var _prevLoadsCount = vm.loads.length;
        vm.filters = filters;
        vm.openCallPopup = confirmCallService.confirmCallPopup.bind(null, $scope, user);
        vm.openBookPopup = confirmBookLoadService.openPopup.bind(null, $scope, user);
        vm.canGetMoreLoads = canGetMoreLoads;
        vm.getMoreLoads = getMoreLoads;
        vm.gettingMoreLoads = false;
        function canGetMoreLoads() {
            return vm.loads.resultsLength > vm.filters.limit && _prevLoadsCount > 0;
        }
        function getMoreLoads() {
            if (vm.gettingMoreLoads) { return; }
            vm.gettingMoreLoads = true;
            loads.getList(vm.filters.status ? vm.filters : searchService.sanitizeDataIntoSearchParams(vm.filters)).then(function(newLoads) {
                vm.filters.index = vm.filters.index + vm.filters.limit;
                _prevLoadsCount = newLoads.length;
                vm.filters.status ? calledLoadsService.addLoadsToCalledLoads(newLoads) : newLoads.forEach(function (load) {
                    vm.loads.push(load);
                });
                $scope.$broadcast('scroll.infiniteScrollComplete');
                vm.gettingMoreLoads = false;
            });
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .factory('confirmCallService', confirmCallService);

    function confirmCallService($ionicPopup, calledLoadsService) {
        var service = {
            confirmCallPopup: confirmCallPopup
        };
        return service;

        ////////////
        // public

        function confirmCallPopup($scope, user, load) {
            $scope.vm.currentLoadToCall = load;
            $scope.vm.formatPhoneNumberForCall = formatPhoneNumberForCall;
            $scope.vm.calledLoad = calledLoad;

            var callPopup = $ionicPopup.show({
                templateUrl: 'main/states/loads/list/confirm-call/confirm-call.html',
                title: 'Call for Load',
                scope: $scope,
                buttons: [{
                    text: 'Cancel',
                }]
            });
            return callPopup;

            function calledLoad() {
                if (user && !load.id) {
                    load.status = 'called';
                    user.post('loads', load).then(function(data) {
                        callPopup.close();
                        angular.extend(load, data[0]);
                        calledLoadsService.addNewlyCalledLoadToCache(load);
                    });
                } else {
                  callPopup.close();
                }
            }

            function formatPhoneNumberForCall(phone) {
                return '1-' + phone;
            }
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .controller('LoadHistoryCtrl', LoadHistoryCtrl);

    function LoadHistoryCtrl($timeout, completedLoads, uploadedLoadId) {
        var vm = this;
        vm.currentLoads = completedLoads;
        vm.uploadedLoadId = uploadedLoadId;

        $timeout(function(){
            vm.uploadedLoadId = null;
        }, 10000);
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .controller('RateConfirmationCtrl', RateConfirmationCtrl);

    function RateConfirmationCtrl($sce, $window, rateConfirmationUrl) {
        // C: tried various way to view pdf within app while being compatible on old android browsers and ios safari
        // https://github.com/sayanee/angularjs-pdf, would have been nice as it allowed pinch zoom however it was not
        // compatible with android 4.0  ended up using https://forum.ionicframework.com/t/how-to-open-external-pdf-url-in-app/14143/4
        // & https://guides.instructure.com/m/4152/l/106654-how-do-i-embed-a-dynamic-google-document-into-the-rich-content-editor
        var vm = this;
        vm.iframeStyle = {'height': ($window.innerHeight - 64) + 'px', 'width': '100%'};
        var encodedPdf = encodeURIComponent(rateConfirmationUrl);
        vm.pdfurl = $sce.trustAsResourceUrl('https://docs.google.com/viewer?url=' + encodedPdf + '&embedded=true');
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .controller('LoadDetailsCtrl', LoadDetailsCtrl);

    function LoadDetailsCtrl($scope,
        confirmCallService,
        confirmUnbookLoadService,
        confirmLoadPickUpService,
        confirmLoadDropOffService,
        confirmUndoDropOffLoadService,
        confirmUndoPickUpLoadService,
        confirmUndoArrivedAtDestinationService,
        confirmUndoArrivedAtOriginService,
        confirmCancelLoadService,
        confirmArrivedAtOriginService,
        confirmArrivedAtDestinationService,
        load, /*From main resolve*/user) {

        var vm = this;
        vm.openCallPopup = confirmCallService.confirmCallPopup.bind(null, $scope);
        vm.confirmUnbookLoad = confirmUnbookLoadService.openPopup.bind(null, $scope, user);
        vm.confirmLoadPickUp = confirmLoadPickUpService.openPopup.bind(null, $scope, user);
        vm.confirmLoadDropOff = confirmLoadDropOffService.openPopup.bind(null, $scope, user);
        vm.confirmUndoDropOffLoad = confirmUndoDropOffLoadService.openPopup.bind(null, $scope, user);
        vm.confirmUndoPickUpLoad = confirmUndoPickUpLoadService.openPopup.bind(null, $scope, user);
        vm.confirmCancelLoad = confirmCancelLoadService.openPopup.bind(null, $scope, user);
        vm.confirmArrivedAtOrigin = confirmArrivedAtOriginService.openPopup.bind(null, $scope, user);
        vm.confirmArrivedAtDestination = confirmArrivedAtDestinationService.openPopup.bind(null, $scope, user);
        vm.confirmUndoArrivedAtDestination = confirmUndoArrivedAtDestinationService.openPopup.bind(null, $scope, user);
        vm.confirmUndoArrivedAtOrigin = confirmUndoArrivedAtOriginService.openPopup.bind(null, $scope, user);
        vm.load = load;
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .factory('imgSliderService', imgSliderService);

    function imgSliderService($ionicModal, $ionicScrollDelegate, $ionicSlideBoxDelegate, $window) {
        var service = {
            openSlider: openSlider
        };
        return service;

        function openSlider($scope, index) {
            $scope.vm.zoomMin = 1;
            $scope.vm.activeSlide = index;
            $scope.vm.closeModal = closeModal;
            $scope.vm.updateSlideStatus = updateSlideStatus;

            $ionicModal.fromTemplateUrl('main/states/loads/details/bill-of-lading/img-slider/img-slider.html', {
                scope: $scope
            }).then(function(modal) {
                $scope.vm.sliderImgHeight = getSliderImgHeight();
                $scope.vm.modal = modal;
                $scope.vm.modal.show();
            });

            function closeModal() {
                $scope.vm.modal.hide();
                $scope.vm.modal.remove();
            }

            function updateSlideStatus(slide) {
                var zoomFactor = $ionicScrollDelegate.$getByHandle('scrollHandle' + slide).getScrollPosition().zoom;
                if (zoomFactor === $scope.vm.zoomMin) {
                    $ionicSlideBoxDelegate.enableSlide(true);
                } else {
                    $ionicSlideBoxDelegate.enableSlide(false);
                }
            }

            function getSliderImgHeight() {
                return Math.floor($window.innerHeight);
            }
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .controller('ImgCropperCtrl', ImgCropperCtrl);

    function ImgCropperCtrl($scope, $timeout, Cropper, billOfLadingSerivce, load, dataUrl) {
        var vm = this;
        vm.dataUrl = dataUrl;

        vm.submit = submit;

        activate();

        function activate() {
            vm.form = {};
            vm.showEvent = 'showCropper';
            vm.options = {
                crop: function(params) {
                    vm.cropParams = params;
                }
            };
            $timeout(function() {
                $scope.$broadcast(vm.showEvent);
            });
        }

        function submit() {
            var blob = Cropper.decode(vm.dataUrl);
            Cropper.crop(blob, vm.cropParams).then(function(blobCropped) {
                Cropper.encode(blobCropped).then(function(dataUrlCropped) {
                    billOfLadingSerivce.uploadReceipt(load, dataUrlCropped).catch(vm.form.setFlashValidity);
                });
            });
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .factory('confirmDeleteBillOfLadingPageService', confirmDeleteBillOfLadingPageService);

    function confirmDeleteBillOfLadingPageService($ionicPopup, errorsService) {
        var service = {
            openPopup: openPopup
        };
        return service;

        function openPopup($scope, _bolKeyLookup, bol) {
            var modal = $ionicPopup.show({
                templateUrl: 'main/states/loads/details/bill-of-lading/bill-of-lading-delete/bill-of-lading-delete.html',
                title: 'Delete Bill of Lading Page',
                scope: $scope,
                buttons: [{
                    text: 'Cancel',
                }, {
                    text: 'Delete',
                    type: 'button-assertive',
                    onTap: function(e) {
                        e.preventDefault();
                        var id = _bolKeyLookup[bol];
                        $scope.vm.load.one('bol', id).remove().then(onSuccess)
                            .catch(function (error) { errorsService.showError(error.data); });

                        function onSuccess() {
                            delete $scope.vm.load.bol[id];
                            $scope.vm.bolPages = _.values($scope.vm.load.bol);
                            modal.close();
                        }
                    }
                }]
            });
            return modal;
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .constant('receiptFileMaxSize', '20MB')
        .constant('receiptFileFormatPattern', 'image/jpeg,image/jpg,image/png,.pdf')
        .constant('receiptFileErrors', {
            size: 'This image is too large',
            format: 'This image is not one of our supported formats'
        })
        .factory('billOfLadingSerivce', billOfLadingSerivce);

    function billOfLadingSerivce($state, $log, $ionicHistory, $ionicLoading, $timeout, filesService, cameraService, receiptFileMaxSize, receiptFileFormatPattern, receiptFileErrors) {
        var service = {
            checkReceiptFile: checkReceiptFile,
            takeReceiptPicture: takeReceiptPicture,
            uploadReceipt: uploadReceipt
        };
        return service;

        ////////////

        function checkReceiptFile(file) {
            var error = filesService.checkFile(file, receiptFileMaxSize, receiptFileFormatPattern);
            return error ? receiptFileErrors[error] : null;
        }

        function takeReceiptPicture(load, fromLibrary, callback) {
            var shouldGoToImgCropperView = ionic.Platform.isIOS();
            shouldGoToImgCropperView ? $ionicLoading.show() : null;
            return cameraService.getPicture(!shouldGoToImgCropperView, fromLibrary).then(function(imageData) {
                var dataUrl = 'data:image/jpeg;base64,' + imageData;
                return shouldGoToImgCropperView ? goToImgCropperView(dataUrl) : uploadReceipt(load, dataUrl, callback);
            }, $ionicLoading.hide);

            function goToImgCropperView(dataUrl){
                $state.go('top.main.loads.load.bill-of-lading-cropper', {dataUrl: dataUrl});
                $timeout($ionicLoading.hide, 1000);
            }
        }

        function uploadReceipt(load, dataUrl, callback) {
            var url = load.getRequestedUrl() + '/bol';
            return filesService.uploadImage(url, dataUrl).then(onSuccess);

            function onSuccess(res) {
                var bolPage = JSON.parse(res.response);
                _.extend(load.bol, bolPage);
                return callback ? callback() : $ionicHistory.clearCache().then(function() {
                    $ionicHistory.goBack();
                });
            }
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .controller('BillOfLadingCtrl', BillOfLadingCtrl);

    function BillOfLadingCtrl($scope, $window, $timeout, $ionicPopup, $ionicActionSheet, $log, billOfLadingSerivce, confirmDeleteBillOfLadingPageService, confirmUploadBillOfLadingService, imgSliderService, errorsService, load, takePhoto) {
        var vm = this;
        var _bolKeyLookup = {};
        vm.load = load;
        vm.takePictureAndUpload = takePictureAndUpload;
        vm.bolImgHeight = getBolImgHeight();
        vm.displayPageInSlider = imgSliderService.openSlider.bind(null, $scope);
        vm.confirmUploadBillOfLading = confirmUploadBillOfLadingService.openPopup.bind(null, $scope);
        activate();

        function activate() {
            if (takePhoto) {
                return takePictureAndUpload();
            }
            vm.bolPages = _.values(vm.load.bol);
            $timeout(fixUploadButtonPosition, 500);

            _bolKeyLookup = _.invert(vm.load.bol);
            vm.deleteReceipt = confirmDeleteBillOfLadingPageService.openPopup.bind(null, $scope, _bolKeyLookup);
        }

        function getBolImgHeight() {
            return Math.floor((($window.innerWidth - 40) / 3) * 1.2941176471 + 10 );
        }

        function fixUploadButtonPosition() {
            angular.element('.solo-add-img-button').prependTo('.solo-add-img-button-content');
        }

        function takePictureAndUpload() {
            if (vm.bolPages.length >= 15) {
                return errorsService.showError('Maximum number of receipts have been attached.');
            }
            var hideSheet = $ionicActionSheet.show({
                buttons: [{
                    text: 'Take new photo'
                }, {
                    text: 'Choose from your photo library'
                }],
                cancelText: 'Cancel',
                cancel: function() {
                    hideSheet();
                },
                buttonClicked: function(index) {
                    onUploadBillOfLadingOptionsConfirmed(vm.load, index === 1);
                    return true;
                }
            });
        }

        function onUploadBillOfLadingOptionsConfirmed(load, fromLibrary) {
            billOfLadingSerivce.takeReceiptPicture(load, fromLibrary, onSuccess);

            function onSuccess() {
                vm.bolPages = _.values(load.bol);
            }
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .factory('confirmUploadBillOfLadingService', confirmUploadBillOfLadingService);

    function confirmUploadBillOfLadingService($state, $ionicPopup, $ionicHistory) {
        var service = {
            openPopup: openPopup
        };
        return service;

        function openPopup($scope) {
            var modal = $ionicPopup.show({
                templateUrl: 'main/states/loads/confirm/upload-bill-of-lading/upload-bill-of-lading.html',
                title: 'Confirm Bill of Lading Complete',
                scope: $scope,
                buttons: [{
                    text: 'Cancel',
                }, {
                    text: 'Submit',
                    type: 'button-assertive',
                    onTap: function(e) {
                        e.preventDefault();
                        $scope.vm.load.patch({status: 'uploadedBol'}).then(function(){
                            // Needed to reload user current loads on dashboard
                            $ionicHistory.clearCache();
                            $ionicHistory.nextViewOptions({disableBack: true});
                            modal.close();
                            $state.go('top.main.loads.history', {uploadedLoadId: $scope.vm.load.id}, {reload: true});
                        }, function(){
                            // TODO: test toast error handling
                        });
                    }
                }]
            });
            return modal;
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .factory('confirmUndoPickUpLoadService', confirmUndoPickUpLoadService);

    function confirmUndoPickUpLoadService($state, $ionicPopup, statusMessageLookup) {
        var service = {
            openPopup: openPopup
        };
        return service;

        function openPopup($scope, user, load) {
            var modal = $ionicPopup.show({
                templateUrl: 'main/states/loads/confirm/undo-pickup/undo-pickup.html',
                title: 'Confirm Undo of Load Pick Up',
                scope: $scope,
                buttons: [{
                    text: 'Cancel',
                }, {
                    text: 'Undo',
                    type: 'button-assertive',
                    onTap: function(e) {
                        e.preventDefault();
                        load.patch({status: 'signedRc'}).then(function(){
                            load.status = 'signedRc';
                            load.statusDisplayMessage = statusMessageLookup[load.status];
                            modal.close();
                        }, function(){
                            // TODO: test toast error handling
                        });
                    }
                }]
            });
            return modal;
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .factory('confirmUndoDropOffLoadService', confirmUndoDropOffLoadService);

    function confirmUndoDropOffLoadService($state, $ionicPopup, statusMessageLookup) {
        var service = {
            openPopup: openPopup
        };
        return service;

        function openPopup($scope, user, load) {
            var modal = $ionicPopup.show({
                templateUrl: 'main/states/loads/confirm/undo-dropoff/undo-dropoff.html',
                title: 'Confirm Undo of Load Drop Off',
                scope: $scope,
                buttons: [{
                    text: 'Cancel',
                }, {
                    text: 'Undo',
                    type: 'button-assertive',
                    onTap: function(e) {
                        e.preventDefault();
                        load.patch({status: 'pickedUp'}).then(function(){
                            load.status = 'pickedUp';
                            load.statusDisplayMessage = statusMessageLookup[load.status];
                            modal.close();
                        }, function(){
                            // TODO: test toast error handling
                        });
                    }
                }]
            });
            return modal;
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .factory('confirmUndoArrivedAtOriginService', confirmUndoArrivedAtOriginService);

    function confirmUndoArrivedAtOriginService($state, $ionicPopup, statusMessageLookup) {
        var service = {
            openPopup: openPopup
        };
        return service;

        function openPopup($scope, user, load) {
            var modal = $ionicPopup.show({
                templateUrl: 'main/states/loads/confirm/undo-arrived-at-origin/undo-arrived-at-origin.html',
                title: 'Confirm Undo of Arrived at Pickup Location',
                scope: $scope,
                buttons: [{
                    text: 'Cancel',
                }, {
                    text: 'Undo',
                    type: 'button-assertive',
                    onTap: function(e) {
                        e.preventDefault();
                        load.patch({status: 'signedRc'}).then(function(){
                            load.status = 'signedRc';
                            load.statusDisplayMessage = statusMessageLookup[load.status];
                            modal.close();
                        }, function(){
                            // TODO: test toast error handling
                        });
                    }
                }]
            });
            return modal;
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .factory('confirmUndoArrivedAtDestinationService', confirmUndoArrivedAtDestinationService);

    function confirmUndoArrivedAtDestinationService($state, $ionicPopup, statusMessageLookup) {
        var service = {
            openPopup: openPopup
        };
        return service;

        function openPopup($scope, user, load) {
            var modal = $ionicPopup.show({
                templateUrl: 'main/states/loads/confirm/undo-arrived-at-destination/undo-arrived-at-destination.html',
                title: 'Confirm Undo of Arrived at Destination',
                scope: $scope,
                buttons: [{
                    text: 'Cancel',
                }, {
                    text: 'Undo',
                    type: 'button-assertive',
                    onTap: function(e) {
                        e.preventDefault();
                        load.patch({status: 'pickedUp'}).then(function(){
                            load.status = 'pickedUp';
                            load.statusDisplayMessage = statusMessageLookup[load.status];
                            modal.close();
                        }, function(){
                            // TODO: test toast error handling
                        });
                    }
                }]
            });
            return modal;
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .factory('confirmUnbookLoadService', confirmUnbookLoadService);

    function confirmUnbookLoadService($state, $ionicPopup, $ionicHistory) {
        var service = {
            openPopup: openPopup
        };
        return service;

        function openPopup($scope, user, load) {
            var modal = $ionicPopup.show({
                templateUrl: 'main/states/loads/confirm/unbook-load/unbook-load.html',
                title: 'Confirm Unbook Load',
                scope: $scope,
                buttons: [{
                    text: 'Cancel',
                }, {
                    text: 'Unbook',
                    type: 'button-assertive',
                    onTap: function(e) {
                        e.preventDefault();
                        load.patch({status: 'called'}).then(function(){
                            // Needed to reload user current loads on dashboard
                            $ionicHistory.clearCache();
                            modal.close();
                            $state.go('top.main.dashboard', null, {reload: true});
                        }, function(){
                            // TODO: test toast error handling
                        });
                    }
                }]
            });
            return modal;
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .factory('confirmLoadPickUpService', confirmLoadPickUpService);

    function confirmLoadPickUpService($state, $ionicPopup, $ionicHistory, statusMessageLookup) {
        var service = {
            openPopup: openPopup
        };
        return service;

        function openPopup($scope, user, load) {
            var modal = $ionicPopup.show({
                templateUrl: 'main/states/loads/confirm/pickup-load/pickup-load.html',
                title: 'Confirm Pickup',
                scope: $scope,
                buttons: [{
                    text: 'Cancel',
                }, {
                    text: 'Pickup',
                    type: 'button-positive',
                    onTap: function(e) {
                        e.preventDefault();
                        load.patch({status: 'pickedUp'}).then(function(){
                            load.status = 'pickedUp';
                            load.statusDisplayMessage = statusMessageLookup[load.status];
                            modal.close();
                        }, function(){
                            // TODO: test toast error handling
                        });
                    }
                }]
            });
            return modal;
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .factory('confirmLoadDropOffService', confirmLoadDropOffService);

    function confirmLoadDropOffService($state, $ionicPopup, $ionicHistory, statusMessageLookup) {
        var service = {
            openPopup: openPopup
        };
        return service;

        function openPopup($scope, user, load) {
            var modal = $ionicPopup.show({
                templateUrl: 'main/states/loads/confirm/dropoff-load/dropoff-load.html',
                title: 'Confirm Drop Off',
                scope: $scope,
                buttons: [{
                    text: 'Cancel',
                }, {
                    text: 'Drop Off',
                    type: 'button-positive',
                    onTap: function(e) {
                        e.preventDefault();
                        load.patch({status: 'droppedOff'}).then(function(){
                            load.status = 'droppedOff';
                            load.statusDisplayMessage = statusMessageLookup[load.status];
                            modal.close();
                        }, function(){
                            // TODO: test toast error handling
                        });
                    }
                }]
            });
            return modal;
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .factory('confirmCancelLoadService', confirmCancelLoadService);

    function confirmCancelLoadService($state, $ionicPopup, $ionicHistory) {
        var service = {
            openPopup: openPopup
        };
        return service;

        function openPopup($scope, user, load) {
            var modal = $ionicPopup.show({
                templateUrl: 'main/states/loads/confirm/cancel-load/cancel-load.html',
                title: 'Confirm Cancel',
                scope: $scope,
                buttons: [{
                    text: 'Back',
                }, {
                    text: 'Cancel Load',
                    type: 'button-assertive',
                    onTap: function(e) {
                        e.preventDefault();
                        // load.route = 'drivers/' + user.id + '/loads';
                        load.patch({status: 'cancelled'}).then(function(){
                            // Needed to reload user current loads on dashboard
                            $ionicHistory.clearCache();
                            $ionicHistory.nextViewOptions({disableBack: true});
                            modal.close();
                            $state.go('top.main.loads.history', null, {reload: true});
                        }, function(){
                            // TODO: test toast error handling
                        });
                    }
                }]
            });
            return modal;
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .factory('confirmBookLoadService', confirmBookLoadService);

    function confirmBookLoadService($state, $ionicPopup, $ionicHistory) {
        var service = {
            openPopup: openPopup
        };
        return service;

        function openPopup($scope, user, load) {
            $scope.vm.rateExpected = null;
            $scope.vm.displayRateRangeWarning = $scope.vm.displayMissingRateWarning = null;
            var modal = $ionicPopup.show({
                templateUrl: 'main/states/loads/confirm/book-load/book-load.html',
                title: 'Confirm Booking',
                scope: $scope,
                buttons: [{
                    text: 'Cancel',
                }, {
                    text: 'Book!',
                    type: 'button-positive',
                    onTap: function(e) {
                        e.preventDefault();
                        if (isRateExpectedNotValid()) {
                            return;
                        }
                        load.route = _.includes(load.getRequestedUrl(), '/drivers/') ? load.route : 'drivers/' + user.id + '/loads';
                        load.patch({status: 'booked', rateExpected: $scope.vm.rateExpected}).then(function(){
                            // Needed to reload user current loads on dashboard
                            $ionicHistory.clearCache();
                            $ionicHistory.nextViewOptions({disableBack: true});
                            modal.close();
                            $state.go('top.main.dashboard', {justBookedLoad: true}, {reload: true});
                        }, function(){
                            // TODO: test toast error handling
                        });

                        function isRateExpectedNotValid(){
                            if (!$scope.vm.rateExpected) {
                                $scope.vm.displayMissingRateWarning = true;
                                return true;
                            }
                            if ($scope.vm.rateExpected < 10 || $scope.vm.rateExpected > 10000){
                                $scope.vm.displayRateRangeWarning = true;
                                return true;
                            }
                            $scope.vm.displayRateRangeWarning = $scope.vm.displayMissingRateWarning = false;
                            return false;
                        }
                    }
                }]
            });
            return modal;
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .factory('confirmArrivedAtOriginService', confirmArrivedAtOriginService);

    function confirmArrivedAtOriginService($state, $ionicPopup, $ionicHistory, statusMessageLookup) {
        var service = {
            openPopup: openPopup
        };
        return service;

        function openPopup($scope, user, load) {
            var modal = $ionicPopup.show({
                templateUrl: 'main/states/loads/confirm/arrived-at-origin/arrived-at-origin.html',
                title: 'Confirm Arrived at Pickup Location',
                scope: $scope,
                buttons: [{
                    text: 'Cancel',
                }, {
                    text: 'Arrived',
                    type: 'button-positive',
                    onTap: function(e) {
                        e.preventDefault();
                        load.patch({status: 'arrivedAtOrigin'}).then(function(){
                            load.status = 'arrivedAtOrigin';
                            load.statusDisplayMessage = statusMessageLookup[load.status];
                            modal.close();
                        }, function(){
                            // TODO: test toast error handling
                        });
                    }
                }]
            });
            return modal;
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .factory('confirmArrivedAtDestinationService', confirmArrivedAtDestinationService);

    function confirmArrivedAtDestinationService($state, $ionicPopup, $ionicHistory, statusMessageLookup) {
        var service = {
            openPopup: openPopup
        };
        return service;

        function openPopup($scope, user, load) {
            var modal = $ionicPopup.show({
                templateUrl: 'main/states/loads/confirm/arrived-at-destination/arrived-at-destination.html',
                title: 'Confirm Arrived at Destination',
                scope: $scope,
                buttons: [{
                    text: 'Cancel',
                }, {
                    text: 'Arrived',
                    type: 'button-positive',
                    onTap: function(e) {
                        e.preventDefault();
                        load.patch({status: 'arrivedAtDestination'}).then(function(){
                            load.status = 'arrivedAtDestination';
                            load.statusDisplayMessage = statusMessageLookup[load.status];
                            modal.close();
                        }, function(){
                            // TODO: test toast error handling
                        });
                    }
                }]
            });
            return modal;
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .factory('calledLoadsService', calledLoadsService);

    function calledLoadsService(userService, paginationDefaults) {
        var calledLoads = [];
        var service = {
            getAndCacheCalledLoads: getAndCacheCalledLoads,
            addLoadsToCalledLoads: addLoadsToCalledLoads,
            addNewlyCalledLoadToCache: addNewlyCalledLoadToCache,
            initCalledLoads: initCalledLoads,
            getCacheCalledLoads: getCacheCalledLoads
        };
        return service;

        function getAndCacheCalledLoads(user) {
            return user.getList('loads', _.assign({status: 'called'}, paginationDefaults)).then(function(loads){
                initCalledLoads(loads);
                return loads;
            });
        }
        function addNewlyCalledLoadToCache(load) {
            calledLoads.unshift(load);
            calledLoads.resultsLength++;
        }
        function addLoadsToCalledLoads(loads) {
            _.forEach(loads, function(load) {
                calledLoads.push(load);
            });
        }
        function initCalledLoads(loads) {
            calledLoads = loads;
        }
        function getCacheCalledLoads() {
            return calledLoads;
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .config(config);

    function config($stateProvider) {
        $stateProvider
            .state('top.main.dashboard', {
                // TODO: this is an abstract state, however leaving `abstract: true`
                //      causes a black screen for a split second during a transition to
                //      to any child state, currently no fix beyond removing `abstract: true`:
                //      https://forum.ionicframework.com/t/problem-with-transition-between-abstract-views/14402/7
                // abstract: true,
                url: '/dashboard',
                views: {
                    'pageContent': {
                        templateUrl: 'main/states/dashboard/dashboard.html',
                        controller: 'DashboardCtrl',
                        controllerAs: 'vm',
                    }
                },
                params: {
                    justBookedLoad: null
                },
                resolve: {
                    currentLoads: function(activeLoads, $stateParams) {
                        if ($stateParams.justBookedLoad) {
                            activeLoads[activeLoads.length - 1]._ui = { justBookedLoad: true };
                        }
                        return activeLoads;
                    }
                },
                onEnter: function($ionicHistory) {
                    $ionicHistory.clearHistory();
                    $ionicHistory.nextViewOptions({
                        disableBack: true
                    });
                }
            })
        ;
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.dashboard', []);
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .controller('DashboardCtrl', DashboardCtrl);

    function DashboardCtrl($state, $scope, $stateParams, $timeout, $ionicScrollDelegate, currentLoads, confirmLoadPickUpService, confirmLoadDropOffService, confirmArrivedAtOriginService, confirmArrivedAtDestinationService, /*From main resolve*/user) {
        var vm = this;
        vm.currentLoads = currentLoads;
        vm.confirmLoadPickUp = confirmLoadPickUpService.openPopup.bind(null, $scope, user);
        vm.confirmLoadDropOff = confirmLoadDropOffService.openPopup.bind(null, $scope, user);
        vm.confirmArrivedAtOrigin = confirmArrivedAtOriginService.openPopup.bind(null, $scope, user);
        vm.confirmArrivedAtDestination = confirmArrivedAtDestinationService.openPopup.bind(null, $scope, user);

        if ($stateParams.justBookedLoad) {
            $timeout(function() {
                delete vm.currentLoads[vm.currentLoads.length - 1]._ui;
            }, 15000);
        }
    }
})();

(function () {
    'use strict';

    angular.module('solo.auth', []);
})();

(function() {
    'use strict';

    angular
        .module('solo.auth')
        .controller('LoginCtrl', LoginCtrl);

    function LoginCtrl(Config, $scope, $state, $timeout, authService, errorsService, $log, $ionicViewSwitcher) {
        var vm = this;

        vm.toggleValidationDisabled = toggleValidationDisabled;
        vm.submit = submit;

        activate();

        function activate() {
            vm.form = {};
            vm.currentAppVersion = Config.ENV.VERSION;
        }


        function toggleValidationDisabled() {
            // disable validation during one digest so we don't show the error on link touch
            // but enabled again if the user comes back
            vm.validationDisabled = true;
            $timeout(function() {
                vm.validationDisabled = false;
            });
        }

        function submit() {
            if (vm.form.$invalid) {
                return;
            }
            authService.login(vm.user.loginName, vm.user.password).then(function(){
                vm.form.loading = vm.form.$submitted = false;
                snapshotDeployService.storeMostRecentSnapshotVersion(authService.user);
            }).catch(function(){
                vm.form.loading = vm.form.$submitted = false;
                errorsService.showError('Username or password is incorrect');
            });
        }
    }
})();

(function () {
    'use strict';

    angular
        .module('solo.auth')
        .config(config)
    ;

    function config($stateProvider) {
        $stateProvider
            .state('top.auth', {
                abstract: true,
                template: '<ion-nav-view></ion-nav-view>'
            })
            .state('top.auth.login', {
                url: '/login',
                templateUrl: 'main/states/auth/login/login.html',
                controller: 'LoginCtrl',
                controllerAs: 'vm',
            })
        ;
    }
})();

(function() {
    'use strict';

    angular
        .module('solo')
        .config(config);

    function config($stateProvider) {
        $stateProvider
            .state('top.main', {
                abstract: true,
                templateUrl: 'main/main.html',
                controller: 'MainCtrl',
                controllerAs: 'main',
                resolve: {
                    user: function(authService){
                        return authService.user;
                    },
                    completedLoads: function(user, loadsService) {
                        return loadsService.getAndCacheCompletedLoads(user);
                    },
                    activeLoads: function(user, loadsService) {
                        return loadsService.getAndCacheActiveLoads(user);
                    },
                    calledLoads: function(user, calledLoadsService) {
                        return calledLoadsService.getAndCacheCalledLoads(user);
                    }
                }
            })
            .state('top.main.state-reload', {
                cache: false,
                params: {
                    goToState: null
                },
                views: {
                    'pageContent': {
                        templateUrl: 'main/states/state-reload/state-reload.html',
                        controller: 'StateReloadCtrl',
                        controllerAs: 'vm'
                    }
                }
            });
    }
})();

(function() {
    'use strict';

    angular
        .module('solo')
        .controller('MainCtrl', MainCtrl);

    function MainCtrl(Config, $rootScope, $scope, $state, $ionicModal, $log, confirmCallHomebaseService, user, authService, routingService) {
        var vm = this;
        vm.closeModal = closeModal;
        vm.logout = authService.logout;
        vm.refreshState = refreshState;
        vm.user = user;
        vm.openCallHomeBasePopup = confirmCallHomebaseService.openPopup.bind(null, $scope);

        activate();

        function activate() {
            vm.currentAppVersion = Config.ENV.VERSION;

            // show popup on stateChangeError
            $rootScope.$on('$stateChangeError', function(event, toState, toParams, fromState, fromParams, error) {
                $log.error('$stateChangeError', toState, error);
                $state.go('top.auth.login', null, {reload: true});
                onStateChangeError();
            });

            // hide refresher on complete
            $rootScope.$on('$stateChangeSuccess', onRefreshComplete);
            $rootScope.$on('$stateChangeError', onRefreshComplete);
        }

        function onStateChangeError() {
            if (vm.modal) {
                vm.modal.show();
            } else {
                $ionicModal.fromTemplateUrl('main/components/modals/modal-state-change-error.html', {
                    scope: $scope,
                    animation: 'slide-in-up'
                }).then(function(modal) {
                    vm.modal = modal;
                    modal.show();
                });
            }
        }

        function onRefreshComplete() {
            vm.refresherActive = false;
            $rootScope.$broadcast('scroll.refreshComplete');
        }

        function refreshState() {
            routingService.refreshState();
        }

        function closeModal() {
            vm.modal.hide();
        }
    }
})();

(function() {
    'use strict';

    angular.module('solo.components.validation', [
        'ionic',
        'ngCordova',
        'ngMessages'
    ]);
})();

(function() {
    'use strict';

    angular
        .module('solo.components.validation')
        .config(config);

    function config($httpProvider) {
        $httpProvider.interceptors.push('errorsInterceptor');
    }
})();

(function() {
    'use strict';

    angular.module('solo.components.validation')
        .directive('soloInputFormat', inputFormat);

    function inputFormat($filter) {
        return {
            require: '?ngModel',
            link: function(scope, elem, attrs, ctrl) {
                if (!ctrl) {
                    return;
                }

                var inputFormat = attrs.soloInputFormat;
                var plainValue = '';

                // show/hide viewValue on attr change
                attrs.$observe('soloCharsVisible', setFormattedValue);

                // add validator
                if (inputFormat === 'email') {
                    ctrl.$validators.email = function(value) {
                        return value ? /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i.test(value) : null;
                    };
                } else if (inputFormat === 'ssn') {
                    ctrl.$validators.ssn = function(value) {
                        return (value && value.trim()) ? /^\d{9}$/.test(value) : null;
                    };
                } else if (inputFormat === 'zipCode') {
                    ctrl.$validators.zipCode = function(value) {
                        return value ? /(^\d{5}$)|(^\d{9}$)/.test(value) : null;
                    };
                } else if (inputFormat === 'password') {
                    ctrl.$validators.password = function(value) {
                        return value ? /^(?=.*\d)(?=.*[a-z])/i.test(value) : null;
                    };
                } else if (inputFormat === 'age') {
                    ctrl.$validators.overEighteen = function(value) {
                        return value ? (moment().diff(moment(value, 'MMDDYYYY'), 'years') >= 18) : null;
                    };
                    ctrl.$validators.underHundred = function(value) {
                        return value ? (moment().diff(moment(value, 'MMDDYYYY'), 'years') < 100) : null;
                    };
                    ctrl.$validators.validDate = function(value) {
                        return value ? (moment(value, 'MMDDYYYY').isValid()) : null;
                    };
                } else if (inputFormat === 'funds') {
                    ctrl.$validators.fundsLow = function(value) {
                        return value ? (value >= 10) : null;
                    };
                    ctrl.$validators.funds = function(value) {
                        var max = 25000 * parseInt(value);
                        return value ? (value <= max) : null;
                    };
                }

                // format the viewValue and return plain number
                if (_.includes(['ssn', 'zipCode'], inputFormat)) {
                    ctrl.$parsers.unshift(function(viewValue) {
                        plainValue = getPlainNumber(plainValue, viewValue);
                        setFormattedValue();
                        return plainValue;
                    });
                    scope.$watch(attrs.ngModel, function(val) {
                        if (val) {
                            plainValue = val;
                            setFormattedValue();
                        }
                    });
                }

                function setFormattedValue() {
                    elem.val($filter(inputFormat)(plainValue, attrs.soloCharsVisible));
                }
            }
        };

        function getPlainNumber(lastPlainNumber, viewValue) {
            viewValue = viewValue || '';
            var value = viewValue.replace(/\-/g, '');
            if (viewValue.indexOf('●') === -1) {

                // value not hidden
                return value;
            } else if (value.length === (lastPlainNumber.length + 1)) {

                // number added
                return lastPlainNumber + value[value.length - 1];
            } else if (value.length < lastPlainNumber.length && /\d/.test(value)) {

                // number in the middle deleted. As we can't know which one we reset the input
                return '';
            } else {

                // last number deleted -> trim the value
                return lastPlainNumber.substring(0, value.length);
            }
        }
    }
})();

(function() {
    'use strict';

    angular.module('solo.components.validation')
        .directive('soloFormGroupErrors', formGroupErrors);

    function formGroupErrors() {
        return {
            require: 'form',
            replace: true,
            transclude: true,
            templateUrl: 'main/components/validation/form-group-errors.html',
            scope: {
                field: '=soloFormGroupErrors',
                label: '@'
            }
        };
    }
})();

(function() {
    'use strict';

    angular.module('solo.components.validation')
        .directive('soloFormGroup', formGroup);

    function formGroup($log) {
        return {
            scope: true,
            require: '^form',
            link: link
        };

        function link($scope, $element, $attrs, vm) {

            activate();

            function activate() {
                $element.addClass('solo-form-group');

                // save form group label
                $scope.label = $element.find('label').text();
                if ($scope.label) {
                    $scope.label = $scope.label.replace(/\*/g, '');
                }

                // get input element name
                var inputElem = $element.find('input');
                if (_.isEmpty(inputElem)) {
                    inputElem = $element.find('select');
                }
                var name = inputElem.attr('name');
                if (!name) {
                    $log.error('solo-form-group directive has no child input elements with a \'name\' attribute');
                    return;
                }
                // validate on blur
                inputElem.on('blur', validateField);

                // keep a reference to the field
                $scope.$watch(vm.$name + '.' + name, onFieldRendered);
            }

            function onFieldRendered(field) {
                $scope.field = field;

                // validate if user types a valid input
                $scope.$watch('field.$invalid', function(invalid) {
                    if (!invalid) {
                        validateField();
                    }
                });

                // validate on form submitted
                $scope.$watch(vm.$name + '.$submitted', function(value) {
                    if (value) {
                        validateField();
                    }
                });
                // validate on custom error from API
                $scope.$watch('field.$error.custom', function(value) {
                    if (value) {
                        validateField();
                    }
                });
                // WORKAROUND special validation for solo-input-field="funds"
                // because it needs to validate again when the period changes
                // FIXME
                $scope.$watch('field.$error.funds+field.$error.fundsLow', function(value) {
                    if (value) {
                        validateField();
                    }
                });
            }

            function validateField() {
                if (!$scope.field || $attrs.validationDisabled === 'true') {
                    return;
                }
                // toggle `has-error` class
                $element.toggleClass('has-error', $scope.field.$invalid);

                $scope.field.validated = true;
            }
        }
    }
})();

(function() {
    'use strict';

    angular.module('solo.components.validation')
        .constant('defaultFormErrorMessage', 'Error occurred')
        .directive('soloForm', form);

    function form($document, $timeout, $log, $cordovaToast, errorsService, defaultFormErrorMessage) {
        return {
            require: 'form',
            link: function($scope, $element, $attrs, Ctrl) {
                Ctrl.setFlashValidity = setFlashValidity;
                Ctrl.setSuccess = setSuccess;

                activate();

                function activate() {
                    $scope.$watch(function() {
                        return Ctrl.$submitted;
                    }, function(submitted) {
                        if (Ctrl.$valid) {
                            Ctrl.loading = submitted;
                        } else {
                            // on next digest
                            // 1. launch fields validation
                            // 2. listen on next form submitted
                            $timeout(function() {
                                Ctrl.$setPristine();
                            });
                        }
                    });
                }

                // extend FormController to show errors from API
                function setFlashValidity(rejection) {
                    Ctrl.$setPristine();
                    Ctrl.loading = false;
                    errorsService.extendErrorInfo(rejection);
                    var data = rejection.data || rejection;
                    var fieldName = data.field;
                    var field = Ctrl[fieldName];
                    var message = data.message || defaultFormErrorMessage;

                    if (field) {

                        // show custom error on field
                        field.$setTouched();
                        field.$setValidity('custom', false);
                        field.$error.custom = message;
                        field.$setPristine();

                        // validate field again if form changed. Necessary for cases like login,
                        // where the custom error for loginName is removed if the password changes
                        $scope.$watch(Ctrl.$name + '.$dirty', function(newValue, oldValue) {
                            if (newValue && !oldValue) {
                                field.$setValidity('custom', true);
                            }
                        });
                    }
                }

                function setSuccess(message) {
                    Ctrl.loading = false;
                    Ctrl.success = true;
                    Ctrl.successMessage = _.isString(message) ? message : 'Success!';
                }
            }
        };
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.components.validation')
        .factory('errorsService', errorsService)
        .constant('errorsMap', [{
            regexp: /InvalidRoutingNumberException/,
            field: 'routingNumber',
            message: 'Invalid Routing Number'
        }, {
            regexp: /PennyDepositsVerificationException/,
            message: 'Incorrect deposit amounts entered'
        }, {
            regexp: /SSNAlreadyRegisteredException/,
            field: 'ssn',
            message: 'Social Security Number already registered'
        }, {
            regexp: /CompanyNameAlreadyExistsException/,
            field: 'companyName',
            message: 'Company name already registered'
        }, {
            regexp: /TaxIdAlreadyExistsException/,
            field: 'taxId',
            message: 'Tax Id already registered'
        }, {
            regexp: /UserCreationConstraintException/,
            field: 'email',
            message: 'Email is already registered'
        }, {
            regexp: /FieldTakenException/,
            field: 'loginName',
            message: 'This email address already belongs to a user'
        }, {
            regexp: /UserNotFoundException/,
            field: 'loginName',
            message: 'Email is not found on our system'
        }, {
            regexp: /InvalidUserNameOrPasswordException/,
            field: 'loginName',
            message: 'Could not locate user with the provided user name and password'
        }, {
            regexp: /UserDeletedException/,
            message: 'This Account is no longer active. If you have questions about this, please contact support@drivesolo.com'
        }, {
            regexp: /MaxLoadSumPerDayReached/,
            field: 'fundsToAdd',
            message: 'Loads are limited to $5,000 per day, please enter different amount or try again later'
        }, {
            regexp: /MaxBalanceReached/,
            field: 'fundsToAdd',
            message: 'Your maximum balance is $25,000.'
        }, {
            regexp: /InvalidCardPanException/,
            field: 'lastFour',
            message: 'Incorrect last four'
        }, {
            regexp: /uiInvalidUserType/,
            field: 'loginName',
            message: 'Sorry but currently only employees are able to use our app but we are working on allowing everyone to use it!'
        }]);

    function errorsService($log, $ionicPlatform, $window, $cordovaToast, errorsMap) {
        var service = {
            showError: showError,
            extendErrorInfo: extendErrorInfo
        };
        return service;

        ////////////
        // public

        function showError(errorMessage) {
            $log.error(errorMessage);
            // show error on a toast
            $ionicPlatform.ready(function() {
                if ($window.plugins) {
                    $cordovaToast.showLongTop(errorMessage);
                } else { // so we can test toasts on mobile.
                  if (window.toastr) {
                    window.toastr.error(errorMessage);
                  } else { // dynamically load toastr deps first time so it doesn't slow down mobile.
                    appendElementWithAttrs(document.head, 'script', {src: '//ajax.googleapis.com/ajax/libs/jquery/3.3.1/jquery.min.js'}, function () {
                      appendElementWithAttrs(document.head, 'script', {src: '//cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/toastr.min.js'}, function () {
                        appendElementWithAttrs(document.head, 'link', {href: 'https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/toastr.min.css', rel: 'stylesheet'}, function () {
                          window.toastr.error(errorMessage);
                        });
                      });
                    });
                  }
                }
            });
        }

        function extendErrorInfo(rejection) {
            var data = rejection.data || rejection;
            if (!data.field) {
                rejection.data = _getErrorObject(data.error);
            }
        }

        ////////////
        // private

        function _getErrorObject(error) {
            var result = _.find(errorsMap, function(obj) {
                return obj.regexp.test(error);
            });
            return result || {
                message: 'Oops! We’ve encountered an issue and were not able to complete your request. Try again or call Home Base.'
            };
        }
    }

    function appendElementWithAttrs (anchor, elementType, attrsObj, onloadCallback) {
      var element = document.createElement(elementType);
      Object.keys(attrsObj).forEach(function (key) {element.setAttribute(key, attrsObj[key]);});
      element.onload = onloadCallback;
      anchor.appendChild(element);
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.components.validation')
        .factory('errorsInterceptor', errorsInterceptor);

    function errorsInterceptor($q, errorsService) {
        return {
            responseError: function(rejection) {
                if (rejection.status === 0) {
                  errorsService.showError('No server response. Please check your Internet connection.');
                } else if (!_.includes([401, 403], rejection.status)) {
                    // show error
                    errorsService.showError(rejection.data);
                }
                return $q.reject(rejection);
            }
        };
    }
})();

(function() {
    'use strict';

    angular
        .module('solo')
        .factory('warningsService', warningsService);

    function warningsService($state, Warnings) {
        var service = {
            displayWarnings: displayWarnings
        };
        return service;

        ////////////

        function displayWarnings() {
            return Warnings.one().get().then(function(warnings){
                if ( !warnings.supported ) {
                    $state.go('top.warning-message');
                }
            }, function(){
                return 'error';
            });
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo')
        .factory('userService', userService);

    function userService(paginationDefaults) {
        var service = {
            getLoadParamsForDashboard: getLoadParamsForDashboard,
            getLoadParamsForHistory: getLoadParamsForHistory
        };
        return service;

        function getLoadParamsForDashboard() {
            return { index: 0, limit: 200, status: ['booked', 'signedRc', 'arrivedAtOrigin', 'pickedUp', 'arrivedAtDestination', 'droppedOff'].join('|') };
        }
        function getLoadParamsForHistory() {
            return _.assign({ status: ['uploadedBol', 'verifiedBol', 'paid', 'cancelled'].join('|') }, paginationDefaults);
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo')
        .factory('snapshotDeployService', snapshotDeployService);

    function snapshotDeployService($ionicDeploy, $ionicLoading, $ionicPopup, Platforms, authService) {
        var _appUpdatePopUpIsNotOpen = true;
        var service = {
            applySnapShotIfAvailable: applySnapShotIfAvailable,
            storeMostRecentSnapshotVersion: storeMostRecentSnapshotVersion
        };
        return service;

        ////////////
        // public

        function applySnapShotIfAvailable() {
            storeMostRecentSnapshotVersion(authService.user);
            return $ionicDeploy.check().then(function(snapshotAvailable) {
                if (snapshotAvailable && _appUpdatePopUpIsNotOpen) {
                    _appUpdatePopUpIsNotOpen = false;
                    $ionicPopup.alert({
                        title: '<h3> App Update </h3>',
                        template: '<h4 class="text-center"> We just added some improvements to the app! All you have to do is click OK to reload the updated app! </h4>'
                    }).then(function() {
                        $ionicLoading.show();
                        $ionicDeploy.download().then(function() {
                            $ionicDeploy.extract().then(function() {
                                _appUpdatePopUpIsNotOpen = true;
                                $ionicLoading.hide();
                                $ionicDeploy.load();
                            });
                        });
                    });
                }
            });
        }

        ////////////
        // private

        function storeMostRecentSnapshotVersion(user) {
            if (user && user.id) {
                $ionicDeploy.info().then(function(currentSnapshot) {
                    var payload = {mobileAppVersion: currentSnapshot.binary_version};
                    if (currentSnapshot.deploy_uuid !== 'NO_DEPLOY_AVAILABLE') {
                        payload.mobileAppUuid = currentSnapshot.deploy_uuid;
                    }
                    Platforms.one(user.id).patch(payload);
                });
            }
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo')
        .factory('routingService', routingService);

    function routingService($rootScope, $state, $ionicViewSwitcher, $ionicHistory) {
        var service = {
            goBack: goBack,
            refreshState: refreshState
        };
        return service;

        function goBack(stateName, stateParams) {
            $ionicViewSwitcher.nextDirection('back');
            if (stateName) {
                $state.go(stateName, stateParams);
            } else {
                $ionicHistory.goBack();
            }
        }

        function refreshState() {
            if ($state.current.name !== 'top.main.dashboard' && $state.current.name !== 'top.main.loads.history' && $state.current.name !==  'top.main.loads.called') {
                return;
            }
            $rootScope.refresherActive = true;
            $ionicHistory.nextViewOptions({
                disableAnimate: true
            });
            $state.go('top.main.state-reload', {
                goToState: $state.current.name,
                // goToStateParams: $state.params
            }, {
                reload: true
            });
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo')
        .factory('filesService', filesService);

    function filesService($cordovaFileTransfer, authTokenService) {
        var service = {
            uploadImage: uploadImage
        };
        return service;

        ////////////

        function uploadImage(url, imageData) {
            var filename = imageData.name || 'test' || imageData.split('/').pop();
            var options = {
                fileKey: 'image',
                fileName: filename,
                chunkedMode: true,
                mimeType: 'image/jpeg',
                trustAllHosts: true,
                headers: {
                    Authorization: authTokenService.getActiveToken(),
                },
                params: {
                    filename: filename,
                }
            };
            return $cordovaFileTransfer.upload(url, imageData, options);
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo')
        .factory('datePickerService', datePickerService);

    function datePickerService(ionicDatePicker) {
        var service = {
            openSearchDatePicker: openSearchDatePicker
        };
        return service;

        ////////////

        function openSearchDatePicker(vm, dateType){
            var datePickerConfig = {
                callback: onDateSet,
                from: dateType === 'to' && vm.data.dateRange.from ? new Date(vm.data.dateRange.from.valueOf()) : new Date(),
                to: dateType === 'from' && vm.data.dateRange.to ? new Date(vm.data.dateRange.to.valueOf()) : new Date(moment().add(2, 'weeks').valueOf()),
                inputDate: new Date(),
                closeOnSelect: false,
                mondayFirst: false,
                templateType: 'popup'
            };

            ionicDatePicker.openDatePicker(datePickerConfig);

            function onDateSet(val){
                if ( dateType === 'to' ){
                    vm.data.dateRange.to = moment(val);
                }
                else {
                    vm.data.dateRange.from = moment(val);
                }
            }
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo')
        .factory('cameraService', cameraService);

    function cameraService($ionicPlatform, $cordovaCamera) {
        var service = {
            getPicture: getPicture
        };
        return service;

        ////////////
        // public

        function getPicture(allowEdit, fromLibrary) {
            var sourceType = fromLibrary ? Camera.PictureSourceType.PHOTOLIBRARY : Camera.PictureSourceType.CAMERA;
            var cameraOptions = {
                quality: 75,
                destinationType: Camera.DestinationType.DATA_URL,
                sourceType: sourceType,
                allowEdit: allowEdit,
                encodingType: Camera.EncodingType.JPEG,
                popoverOptions: CameraPopoverOptions,
                saveToPhotoAlbum: false,
                correctOrientation: true
            };
            return $ionicPlatform.ready()
                .then(function() {
                    return $cordovaCamera.getPicture(cameraOptions);
                });
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo')
        .factory('authTokenService', authTokenService);

    function authTokenService($localStorage) {
        var _userToken = null;
        var service = {
            getActiveToken: getActiveToken,
            setActiveToken: setActiveToken,
            destroyActiveToken: destroyActiveToken
        };
        return service;

        function getActiveToken() {
            _userToken = _userToken ? _userToken : $localStorage.userToken;
            return _userToken || $localStorage.userToken;
        }

        function setActiveToken(token) {
            _userToken = $localStorage.userToken = token;
        }

        function destroyActiveToken() {
            _userToken = null;
            delete $localStorage.userToken;
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo')
        .factory('authHeaderService', authHeaderService);

    function authHeaderService(authTokenService) {
        var authHeader = {
            request: function(config) {
                if (authTokenService.getActiveToken()){
                    config.headers['Authorization'] = authTokenService.getActiveToken();
                }
                return config;
            }
        };
        return authHeader;
    }
})();

(function() {
    'use strict';

    angular
        .module('solo')
        .factory('authService', authService);

    function authService($state, $q, authTokenService, $http, Users, $ionicViewSwitcher) {
        var service = {
            user: {}, // DON'T LOSE THE REF!
            login: login,
            logout: logout,
            tryReconnect: tryReconnect,
        };
        return service;

        ////////////

        function login (username, password, token) {
            var deferred = $q.defer();
            token = token || 'Basic ' + window.btoa(username + ':' + password);
            authTokenService.setActiveToken(token);
            Users.getList().then(function (response) {
              Object.getOwnPropertyNames(response[0]).forEach(function (prop) { service.user[prop] = response[0][prop]; });
              $ionicViewSwitcher.nextDirection('forward');
              $state.go('top.main.dashboard');
              deferred.resolve();
            }).catch(deferred.reject);
            return deferred.promise;
        }

        function logout () {
            var deferred = $q.defer();
            authTokenService.destroyActiveToken();
            Object.getOwnPropertyNames(service.user).forEach(function (prop) { delete service.user[prop]; });
            $ionicViewSwitcher.nextDirection('back');
            $state.go('top.auth.login');
            deferred.resolve();
            return deferred.promise;
        }

        function tryReconnect () {
          if (authTokenService.getActiveToken()) {
            return login(null, null, authTokenService.getActiveToken());
          } else {
            return logout();
          }
        }
    }

})();

(function() {
    'use strict';

    angular.module('solo.resources', [
        'restangular',
        'solo.config'
    ]);
})();

(function () {
    'use strict';

    angular
        .module('solo.resources')
        .factory('Users', Users)
    ;

    function Users(Restangular) {
        return Restangular
            .service('drivers');
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.resources')
        .factory('Subscription', Subscription);

    function Subscription(Restangular) {
        return Restangular
            .service('subscription');
    }
})();

(function () {
    'use strict';

    angular
        .module('solo.resources')
        .factory('Sessions', Sessions)
    ;

    function Sessions(Restangular) {
        return Restangular
            .service('sessions');
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.resources')
        .run(runBlock);

    function runBlock(Restangular, $state, $log) {
        Restangular.setErrorInterceptor(function(rejection) {
            if (rejection.status === 401 || rejection.status === 403) {
                $log.error('Unauthorized, returning to login.');
                $state.go('top.auth.login');
            }
            return true;
        });
    }
})();

(function () {
    'use strict';

    angular
        .module('solo.resources')
        .factory('Platforms', Platforms)
    ;

    function Platforms(Restangular) {
        return Restangular
            .service('platforms');
    }
})();

(function () {
    'use strict';

    angular
        .module('solo.resources')
        .factory('Loads', Loads)
        .config(configInterceptors)
    ;

    function Loads(Restangular) {
        return Restangular
            .service('loads');
    }

    function configInterceptors(RestangularProvider, statusMessageLookup){
        RestangularProvider.addResponseInterceptor(function(data, operation, resource) {
            if (resource !== 'loads' || typeof data === 'string') {
                return data;
            }
            var formattedData = null;
            if (data.data) {
                formattedData = Array.isArray(data.data) ? data.data : [data.data];
                formattedData.resultsLength = data.length;
            } else {
                formattedData = Array.isArray(data) ? data : [data];
            }
            _.forEach(formattedData, extendLoad);
            return formattedData;

            function extendLoad(load){
                formatPickUpDate(load);
                formatTimePostedAgo(load);
                load.statusDisplayMessage = statusMessageLookup[load.status];
            }
            // TODO: Move to directive
            function formatPickUpDate(load){
                var pickupDate = moment(load.origin.date);
                load.origin.formattedDate = pickupDate.format('MMM Do');
            }
            // TODO: Move to directive
            function formatTimePostedAgo(load){
                load.timePostedAgo = moment(load.postedDate).fromNow();
                load.timePostedAgo = load.timePostedAgo.replace('seconds', 'secs');
                load.timePostedAgo = load.timePostedAgo.replace('minute', 'min');
                load.timePostedAgo = load.timePostedAgo.replace('minutes', 'mins');
                load.timePostedAgo = load.timePostedAgo.replace('hour', 'hr');
                load.timePostedAgo = load.timePostedAgo.replace('hours', 'hrs');
                // load.timePostedAgo = load.timePostedAgo.replace('days', 'd');
                // load.timePostedAgo = load.timePostedAgo.replace('day', 'd');
                load.timePostedAgo = load.timePostedAgo.split('ago')[0];
            }
        });
        RestangularProvider.addRequestInterceptor(function(data, operation, resource) {
            if (resource !== 'loads' || (operation !== 'put' && operation !== 'post' && operation !== 'patch')) {
                return data;
            }
            if (data._ui) {
                delete data._ui;
            }
            return data;
        });
    }
})();

(function() {
    'use strict';

    angular.module('solo')
        .directive('soloResolvingSpinner', resolvingSpinner);

    function resolvingSpinner() {
        return {
            template: '<ion-spinner ng-show="spinner.visible && spinner.active" style="stroke: #017ebd;"></ion-spinner>',
            replace: true,
            controller: ResolvingSpinnerController,
            controllerAs: 'spinner',
            scope: {
                active: '='
            },
            bindToController: true
        };
    }

    function ResolvingSpinnerController($rootScope) {
        var spinner = this;

        activate();

        function activate() {
            $rootScope.$on('$stateChangeStart', showSpinner);
            $rootScope.$on('$stateChangeSuccess', hideSpinner);
            $rootScope.$on('$stateChangeError', hideSpinner);
        }

        function showSpinner() {
            spinner.visible = true;
        }

        function hideSpinner() {
            spinner.visible = false;
        }
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .constant('homebaseNumber', '815-703-9039')
        .factory('confirmCallHomebaseService', confirmCallHomebaseService);

    function confirmCallHomebaseService($ionicPopup, homebaseNumber) {
        var service = {
            openPopup: openPopup
        };
        return service;

        function formatPhone(phone) {
            return '1-' + phone;
        }

        ////////////
        // public

        function openPopup($scope) {
            var modal = $ionicPopup.show({
                templateUrl: 'main/components/popups/call-homebase/call-homebase.html',
                title: 'Call Homebase',
                scope: $scope,
                buttons: [{
                    text: 'Cancel',
                }]
            });
            $scope.vm = {
              calledHome: modal.close,
              formatPhone: formatPhone,
              homebaseNumber: homebaseNumber
            };
            return modal;
        }
    }
})();

(function () {
    'use strict';

    angular.module('solo.mocks', [
        'ngMockE2E'
    ]);
})();

(function() {
    'use strict';

    angular
        .module('solo.mocks')
        .run(init)
        // NOTE add here the stuff that you think should be provided by API
        // for other constants use `*.constants.js` or `*.service.js` files
    ;

    function init($httpBackend) {

        // GET /api/loads (get loads)
        // $httpBackend.whenGET(/loads\?/).respond(function() {
        //     return [200, loadsMock];
        // });

        // GET /api/drivers/me (get drivers)
        // $httpBackend.whenGET(/drivers\?/).respond(function() {
        //     return [200, driverMock];
        // });

        // For everything else, don't mock
        $httpBackend.whenGET(/.*/).passThrough();
        $httpBackend.whenPOST(/.*/).passThrough();
        $httpBackend.whenPUT(/.*/).passThrough();
        $httpBackend.whenDELETE(/.*/).passThrough();
        $httpBackend.whenPATCH(/.*/).passThrough();
    }
})();

(function() {
    'use strict';

    angular
        .module('solo.mocks')
        .constant('loadsMock', [
            { 'Bond': 202, 'PickUpDate': '8/8/2016', 'Weight': '46000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 99, 'TruckCoGuid': '1dfa1a07-2cbb-9609-5683-411d90768491', 'PostingTruckCompanyId': 264637, 'PostGuid': '52586c21-2409-c142-300a-ac93fed76f3d', 'PostId': 1269874305, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'DALLESPORT', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 73, 'OriginLat': 45.6, 'OriginLon': -121.16, 'DestCity': 'ALOHA', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.48, 'DestLon': -122.85, 'Length': '48', 'Phone': '586-914-5991', 'CompanyName': 'NATIONWI', 'Entered': 'Sun, 07 Aug 2016 23:21:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1226740, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 99, 'TruckCoGuid': 'c7800bad-fc2c-0bd5-f250-da1b424e34e6', 'PostingTruckCompanyId': 183675, 'PostGuid': 'e3912ccf-d592-adee-2ccc-7a2dea8a160d', 'PostId': 1269874558, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'DALLESPORT', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 73, 'OriginLat': 45.6, 'OriginLon': -121.16, 'DestCity': 'ALOHA', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.48, 'DestLon': -122.85, 'Length': '48', 'Phone': '607-296-4528', 'CompanyName': 'TRI-BROS', 'Entered': 'Sun, 07 Aug 2016 23:21:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 56063, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/13/2016', 'Weight': '5000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 170, 'TruckCoGuid': '108511c1-6fed-3b33-ef42-5e0b3284a5e7', 'PostingTruckCompanyId': 271989, 'PostGuid': 'ab0a513a-1e90-22b6-ee1d-11fd29f4f7c1', 'PostId': 1269889729, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CHEHALIS', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 81, 'OriginLat': 46.66, 'OriginLon': -122.95, 'DestCity': 'TOPPENISH', 'DestState': 'WA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 46.36, 'DestLon': -120.3, 'Length': '', 'Phone': 'Bid_Online', 'CompanyName': 'SEE LOAD', 'Entered': 'Sun, 07 Aug 2016 23:16:05 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1311291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '15000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 664, 'TruckCoGuid': '108511c1-6fed-3b33-ef42-5e0b3284a5e7', 'PostingTruckCompanyId': 271989, 'PostGuid': 'a9db706c-bd6e-f770-ea35-c400d6e6d180', 'PostId': 1269890408, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CHEHALIS', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 81, 'OriginLat': 46.66, 'OriginLon': -122.95, 'DestCity': 'SACRAMENTO', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.58, 'DestLon': -121.48, 'Length': '', 'Phone': 'Bid_Online', 'CompanyName': 'SEE LOAD', 'Entered': 'Sun, 07 Aug 2016 23:16:05 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1311291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/25/2016', 'Weight': '75000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1743, 'TruckCoGuid': '108511c1-6fed-3b33-ef42-5e0b3284a5e7', 'PostingTruckCompanyId': 271989, 'PostGuid': '0df703ff-5860-b0d0-e200-84f2757cc43b', 'PostId': 1269870027, 'EquipmentType': 'FVR', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'BRUSH PRAIRIE', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 15, 'OriginLat': 45.69, 'OriginLon': -122.48, 'DestCity': 'SAINT PAUL', 'DestState': 'MN', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.94, 'DestLon': -93.08, 'Length': '', 'Phone': 'Bid_Online', 'CompanyName': 'SEE LOAD', 'Entered': 'Sun, 07 Aug 2016 23:16:05 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1311291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '29000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 2731, 'TruckCoGuid': '5c56546f-e304-963f-28f1-6d6614c460ac', 'PostingTruckCompanyId': 108788, 'PostGuid': 'cfae596a-3e82-5065-cf3d-ad665e501ebf', 'PostId': 1269875207, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 3, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'SALEM', 'DestState': 'VA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.28, 'DestLon': -80.05, 'Length': '24', 'Phone': '817-795-5920', 'CompanyName': 'LOGISTIC', 'Entered': 'Sun, 07 Aug 2016 23:14:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 9213, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 99, 'TruckCoGuid': '5c56546f-e304-963f-28f1-6d6614c460ac', 'PostingTruckCompanyId': 108788, 'PostGuid': 'bbe163e0-7352-1942-d864-8d6553d9008e', 'PostId': 1269875229, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'DALLESPORT', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 73, 'OriginLat': 45.6, 'OriginLon': -121.16, 'DestCity': 'ALOHA', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.48, 'DestLon': -122.85, 'Length': '48', 'Phone': '817-795-5920', 'CompanyName': 'LOGISTIC', 'Entered': 'Sun, 07 Aug 2016 23:14:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 9213, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 646, 'TruckCoGuid': '5c56546f-e304-963f-28f1-6d6614c460ac', 'PostingTruckCompanyId': 108788, 'PostGuid': '66d6083e-9e15-90c4-f567-0aca081dfd10', 'PostId': 1269875249, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'NEWARK', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.51, 'DestLon': -122.03, 'Length': '48', 'Phone': '817-795-5920', 'CompanyName': 'LOGISTIC', 'Entered': 'Sun, 07 Aug 2016 23:14:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 9213, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 609, 'TruckCoGuid': '5c56546f-e304-963f-28f1-6d6614c460ac', 'PostingTruckCompanyId': 108788, 'PostGuid': '5fa48de1-3d6b-bd17-f9ca-deceff2aac44', 'PostId': 1269875252, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': '48', 'Phone': '817-795-5920', 'CompanyName': 'LOGISTIC', 'Entered': 'Sun, 07 Aug 2016 23:14:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 9213, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 627, 'TruckCoGuid': '5c56546f-e304-963f-28f1-6d6614c460ac', 'PostingTruckCompanyId': 108788, 'PostGuid': '73315bb1-b28e-ca22-edbd-aca16dccbf8e', 'PostId': 1269875253, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'PETALUMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.22, 'DestLon': -122.63, 'Length': '48', 'Phone': '817-795-5920', 'CompanyName': 'LOGISTIC', 'Entered': 'Sun, 07 Aug 2016 23:14:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 9213, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 625, 'TruckCoGuid': '5c56546f-e304-963f-28f1-6d6614c460ac', 'PostingTruckCompanyId': 108788, 'PostGuid': 'c6294158-ec10-fb67-d38a-07870abccf08', 'PostId': 1269875290, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'SPARKS', 'DestState': 'NV', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.57, 'DestLon': -119.7, 'Length': '48', 'Phone': '817-795-5920', 'CompanyName': 'LOGISTIC', 'Entered': 'Sun, 07 Aug 2016 23:14:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 9213, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 48, 'TruckCoGuid': '5c56546f-e304-963f-28f1-6d6614c460ac', 'PostingTruckCompanyId': 108788, 'PostGuid': '16d022e2-0828-2f24-e6d9-baddc468373a', 'PostId': 1269875292, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LONGVIEW', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 45, 'OriginLat': 46.14, 'OriginLon': -122.9, 'DestCity': 'PORTLAND', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.51, 'DestLon': -122.67, 'Length': '48', 'Phone': '817-795-5920', 'CompanyName': 'LOGISTIC', 'Entered': 'Sun, 07 Aug 2016 23:14:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 9213, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 740, 'TruckCoGuid': 'ad3a0839-d214-8d9c-f87f-6f0ef8afd6a1', 'PostingTruckCompanyId': 62512, 'PostGuid': '8e38276e-78cb-ef85-1082-cc5898f6c853', 'PostId': 1269880012, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MORTON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 75, 'OriginLat': 46.55, 'OriginLon': -122.26, 'DestCity': 'IDAHO FALLS', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.51, 'DestLon': -111.92, 'Length': '48', 'Phone': '863-385-3782', 'CompanyName': 'LKC LOGI', 'Entered': 'Sun, 07 Aug 2016 23:12:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 12582, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 48, 'TruckCoGuid': 'b406e0df-9660-6ce7-30d7-7224f01fa85a', 'PostingTruckCompanyId': 169450, 'PostGuid': '1385d763-a0c3-f517-bea5-14b161ae8a68', 'PostId': 1269413142, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LONGVIEW', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 45, 'OriginLat': 46.14, 'OriginLon': -122.9, 'DestCity': 'PORTLAND', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.51, 'DestLon': -122.67, 'Length': '48', 'Phone': '254-213-6700', 'CompanyName': 'LOGISTIC', 'Entered': 'Sun, 07 Aug 2016 23:03:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 37113, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 99, 'TruckCoGuid': 'b406e0df-9660-6ce7-30d7-7224f01fa85a', 'PostingTruckCompanyId': 169450, 'PostGuid': 'eeff3c16-9a9d-1a34-3cae-1b500c22ec83', 'PostId': 1269479637, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'DALLESPORT', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 73, 'OriginLat': 45.6, 'OriginLon': -121.16, 'DestCity': 'ALOHA', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.48, 'DestLon': -122.85, 'Length': '48', 'Phone': '254-213-6700', 'CompanyName': 'LOGISTIC', 'Entered': 'Sun, 07 Aug 2016 23:03:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 37113, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': 'b406e0df-9660-6ce7-30d7-7224f01fa85a', 'PostingTruckCompanyId': 169450, 'PostGuid': '48257d08-9ddb-8b30-5758-ee2ee238cd04', 'PostId': 1269546957, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.75, 'DestLon': -104.99, 'Length': '48', 'Phone': '254-213-6700', 'CompanyName': 'LOGISTIC', 'Entered': 'Sun, 07 Aug 2016 23:03:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 37113, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': 'b406e0df-9660-6ce7-30d7-7224f01fa85a', 'PostingTruckCompanyId': 169450, 'PostGuid': '745aabdb-6a27-e86b-af83-e39ec0835d58', 'PostId': 1269547411, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.82, 'DestLon': -104.75, 'Length': '48', 'Phone': '254-213-6700', 'CompanyName': 'LOGISTIC', 'Entered': 'Sun, 07 Aug 2016 23:03:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 37113, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 625, 'TruckCoGuid': 'b406e0df-9660-6ce7-30d7-7224f01fa85a', 'PostingTruckCompanyId': 169450, 'PostGuid': '48e70427-3af2-733c-adf7-74ae335c1568', 'PostId': 1269798715, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'SPARKS', 'DestState': 'NV', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.57, 'DestLon': -119.7, 'Length': '48', 'Phone': '254-213-6700', 'CompanyName': 'LOGISTIC', 'Entered': 'Sun, 07 Aug 2016 23:03:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 37113, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 101, 'PickUpDate': '8/9/2016', 'Weight': '44000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 468, 'TruckCoGuid': '32a4b408-9634-b5d2-68d8-53893705bb77', 'PostingTruckCompanyId': 316922, 'PostGuid': '7240aca1-70ec-0950-9bc6-51374e397fc3', 'PostId': 1269874994, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'SAINT PAUL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 26, 'OriginLat': 45.2, 'OriginLon': -122.96, 'DestCity': 'BOISE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.61, 'DestLon': -116.19, 'Length': '53', 'Phone': '800-672-1749', 'CompanyName': 'WORLDWID', 'Entered': 'Sun, 07 Aug 2016 23:01:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1336612, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/15/2016', 'Weight': '13000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 2063, 'TruckCoGuid': '108511c1-6fed-3b33-ef42-5e0b3284a5e7', 'PostingTruckCompanyId': 271989, 'PostGuid': 'b373840a-f563-7294-f36b-ba386912260a', 'PostId': 1269890441, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'MILWAUKEE', 'DestState': 'WI', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.06, 'DestLon': -87.98, 'Length': '', 'Phone': 'Bid_Online', 'CompanyName': 'SEE LOAD', 'Entered': 'Sun, 07 Aug 2016 22:59:54 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1311291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '175', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 0, 'TruckCoGuid': '108511c1-6fed-3b33-ef42-5e0b3284a5e7', 'PostingTruckCompanyId': 271989, 'PostGuid': '0be0e650-6be2-90fe-d1f0-c91517be6fb9', 'PostId': 1269889731, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'VALDEZ', 'DestState': 'AK', 'DestCtry': '', 'DestDist': 0, 'DestLat': 61.13, 'DestLon': -146.34, 'Length': '', 'Phone': 'Bid_Online', 'CompanyName': 'SEE LOAD', 'Entered': 'Sun, 07 Aug 2016 21:59:26 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1311291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/9/2016', 'Weight': '47000', 'Payment': '1000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 524, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '79186add-ec4c-af23-04df-f27b1b06c2d9', 'PostId': 1269889293, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'OLIVEHURST', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.09, 'DestLon': -121.55, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Sun, 07 Aug 2016 21:46:41 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '1500', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 961, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': 'fcd4f5a2-16c7-c9be-152f-77375155e698', 'PostId': 1268956246, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'LOS ANGELES', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.06, 'DestLon': -118.3, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Sun, 07 Aug 2016 20:38:33 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': '14000', 'Payment': '2300', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1339, 'TruckCoGuid': '9e4a0fe4-c56e-d6eb-0e99-5e7d1e3043d8', 'PostingTruckCompanyId': 334852, 'PostGuid': '653df870-ddb5-c4db-7e18-4644d152ee00', 'PostId': 1268588724, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WARRENTON', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 74, 'OriginLat': 46.15, 'OriginLon': -123.91, 'DestCity': 'AURORA', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.69, 'DestLon': -104.78, 'Length': '0', 'Phone': '205-533-3709', 'CompanyName': 'JONES MO', 'Entered': 'Sun, 07 Aug 2016 19:31:48 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1618015, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': '14000', 'Payment': '2300', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1335, 'TruckCoGuid': '9e4a0fe4-c56e-d6eb-0e99-5e7d1e3043d8', 'PostingTruckCompanyId': 334852, 'PostGuid': '41ec199c-c982-a4f4-792b-15b09dc74a2a', 'PostId': 1269807724, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WARRENTON', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 74, 'OriginLat': 46.15, 'OriginLon': -123.91, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.75, 'DestLon': -104.99, 'Length': '0', 'Phone': '205-533-3709', 'CompanyName': 'JONES MO', 'Entered': 'Sun, 07 Aug 2016 19:31:43 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1618015, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1400', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 679, 'TruckCoGuid': '036e4023-f9f4-1424-dc7d-0b9b1849261d', 'PostingTruckCompanyId': 331647, 'PostGuid': 'f864a1ae-6605-724d-2fa8-6f621953c9e9', 'PostId': 1269886895, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'VANCOUVER', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 12, 'OriginLat': 45.66, 'OriginLon': -122.55, 'DestCity': 'HUGHSON', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.62, 'DestLon': -120.9, 'Length': '0', 'Phone': '316-440-4619', 'CompanyName': 'KING OF ', 'Entered': 'Sun, 07 Aug 2016 19:18:18 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1721114, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '15000', 'Payment': '2000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1332, 'TruckCoGuid': '9e4a0fe4-c56e-d6eb-0e99-5e7d1e3043d8', 'PostingTruckCompanyId': 334852, 'PostGuid': 'f26b4d24-7843-c74a-15de-99398d2b0a27', 'PostId': 1269867827, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ASTORIA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 72, 'OriginLat': 46.17, 'OriginLon': -123.82, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.75, 'DestLon': -104.99, 'Length': '0', 'Phone': '205-533-3709', 'CompanyName': 'JONES MO', 'Entered': 'Sun, 07 Aug 2016 18:38:43 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1618015, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '40000', 'Payment': '500', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 272, 'TruckCoGuid': '0264f425-f8f1-4288-f377-649f1297f207', 'PostingTruckCompanyId': 288020, 'PostGuid': '25f4c95d-e4db-7602-50e6-3a9c9980d48f', 'PostId': 1269831927, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'MEDFORD', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 42.31, 'DestLon': -122.87, 'Length': '0', 'Phone': '541-879-3061', 'CompanyName': 'PAC RIM ', 'Entered': 'Sun, 07 Aug 2016 15:22:16 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 779058, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/9/2016', 'Weight': '35000.0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1310, 'TruckCoGuid': '2abe522f-6d1b-19ea-1b04-5508df9e7a70', 'PostingTruckCompanyId': 318678, 'PostGuid': '5638b8d8-d703-7716-64fd-689cd53b9e17', 'PostId': 1269825343, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RIDGEFIELD', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 21, 'OriginLat': 45.81, 'OriginLon': -122.74, 'DestCity': 'KIOWA', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.34, 'DestLon': -104.45, 'Length': '0', 'Phone': '877-577-7925', 'CompanyName': 'RYAN TRA', 'Entered': 'Sun, 07 Aug 2016 12:02:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1211476, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': ' ', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 609, 'TruckCoGuid': 'c26b739d-f9ca-4092-bf54-2a84c6ead18f', 'PostingTruckCompanyId': 45921, 'PostGuid': '0db06e40-031b-3472-d41f-bc52a4ca10f6', 'PostId': 1269878737, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'TILLAMOOK', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.44, 'OriginLon': -123.83, 'DestCity': 'SACRAMENTO', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.58, 'DestLon': -121.48, 'Length': ' ', 'Phone': '800-548-2500', 'CompanyName': 'FOX LUMB', 'Entered': 'Sun, 07 Aug 2016 11:46:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 264, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': ' ', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1161, 'TruckCoGuid': 'c26b739d-f9ca-4092-bf54-2a84c6ead18f', 'PostingTruckCompanyId': 45921, 'PostGuid': '0419846b-ef40-85a8-4d61-081ed9d79860', 'PostId': 1269878741, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'NEW CASTLE', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.57, 'DestLon': -107.53, 'Length': ' ', 'Phone': '800-548-2500', 'CompanyName': 'FOX LUMB', 'Entered': 'Sun, 07 Aug 2016 11:46:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 264, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '47421', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 238, 'TruckCoGuid': 'bebd9f4f-8a5c-6a97-56a7-d594d7e86758', 'PostingTruckCompanyId': 275534, 'PostGuid': '3f93c0f5-0683-a61f-207e-6f4ef0a1000e', 'PostId': 1269877761, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'HILLSBORO', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 15, 'OriginLat': 45.51, 'OriginLon': -122.98, 'DestCity': 'ARLINGTON', 'DestState': 'WA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 48.19, 'DestLon': -122.11, 'Length': '48', 'Phone': '813-279-2781', 'CompanyName': 'UNIVERSA', 'Entered': 'Sun, 07 Aug 2016 11:05:14 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1351165, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 501, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '950', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 646, 'TruckCoGuid': 'baa65298-002b-eafd-5b9b-035b328cab46', 'PostingTruckCompanyId': 275285, 'PostGuid': 'd2284cd7-1284-28b4-92f0-c313c9464c47', 'PostId': 1269485909, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'NEWARK', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.51, 'DestLon': -122.03, 'Length': ' ', 'Phone': '479-208-4125', 'CompanyName': 'SUREWAY ', 'Entered': 'Sun, 07 Aug 2016 09:02:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1217851, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 501, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '950', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 646, 'TruckCoGuid': 'baa65298-002b-eafd-5b9b-035b328cab46', 'PostingTruckCompanyId': 275285, 'PostGuid': '6a28e399-20cb-313e-4063-fa7c1acdd603', 'PostId': 1269622736, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'NEWARK', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.51, 'DestLon': -122.03, 'Length': ' ', 'Phone': '479-208-4125', 'CompanyName': 'SUREWAY ', 'Entered': 'Sun, 07 Aug 2016 09:02:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1217851, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 501, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 625, 'TruckCoGuid': '68d0d66a-1d23-56a1-a784-2198d6a270b7', 'PostingTruckCompanyId': 176281, 'PostGuid': '6b2b1b2d-f3c6-a41c-a9b8-fe14bad697b4', 'PostId': 1269799563, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'SPARKS', 'DestState': 'NV', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.57, 'DestLon': -119.7, 'Length': ' ', 'Phone': '541-826-4786', 'CompanyName': 'SUREWAY ', 'Entered': 'Sun, 07 Aug 2016 09:02:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 80692, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/7/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 740, 'TruckCoGuid': 'ae82b0cf-8c99-4d59-f47e-3c7b4cbeb2ac', 'PostingTruckCompanyId': 265, 'PostGuid': 'f18f5459-288f-41f1-b53e-87361cce1100', 'PostId': 1269873821, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MORTON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 75, 'OriginLat': 46.55, 'OriginLon': -122.26, 'DestCity': 'IDAHO FALLS', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.51, 'DestLon': -111.92, 'Length': ' ', 'Phone': '320-363-6991', 'CompanyName': 'BRENNY T', 'Entered': 'Sun, 07 Aug 2016 09:01:51 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 269, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/7/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1726, 'TruckCoGuid': 'ae82b0cf-8c99-4d59-f47e-3c7b4cbeb2ac', 'PostingTruckCompanyId': 265, 'PostGuid': 'd0044830-7d8d-3cda-cc40-66bd4bfa1cd4', 'PostId': 1269873823, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CULVER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 99, 'OriginLat': 44.51, 'OriginLon': -121.21, 'DestCity': 'BROWNTON', 'DestState': 'MN', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.72, 'DestLon': -94.35, 'Length': ' ', 'Phone': '320-363-6991', 'CompanyName': 'BRENNY T', 'Entered': 'Sun, 07 Aug 2016 09:01:51 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 269, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/7/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 862, 'TruckCoGuid': 'ae82b0cf-8c99-4d59-f47e-3c7b4cbeb2ac', 'PostingTruckCompanyId': 265, 'PostGuid': '02aa43f7-c769-ee59-f092-332ee37d9892', 'PostId': 1269873825, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'SANTA MARIA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.86, 'DestLon': -120.35, 'Length': ' ', 'Phone': '320-363-6991', 'CompanyName': 'BRENNY T', 'Entered': 'Sun, 07 Aug 2016 09:01:51 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 269, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/7/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1091, 'TruckCoGuid': 'ae82b0cf-8c99-4d59-f47e-3c7b4cbeb2ac', 'PostingTruckCompanyId': 265, 'PostGuid': 'dc6936bb-3eca-2992-0906-401738f04bd5', 'PostId': 1269873919, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WARRENTON', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 74, 'OriginLat': 46.15, 'OriginLon': -123.91, 'DestCity': 'FONTANA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.1, 'DestLon': -117.43, 'Length': ' ', 'Phone': '320-363-6991', 'CompanyName': 'BRENNY T', 'Entered': 'Sun, 07 Aug 2016 09:01:51 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 269, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 501, 'PickUpDate': '8/7/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': '68d0d66a-1d23-56a1-a784-2198d6a270b7', 'PostingTruckCompanyId': 176281, 'PostGuid': '6e3df104-239d-d631-0372-06174e04b1c3', 'PostId': 1269873710, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.82, 'DestLon': -104.75, 'Length': ' ', 'Phone': '541-826-4786', 'CompanyName': 'SUREWAY ', 'Entered': 'Sun, 07 Aug 2016 09:01:43 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 80692, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 501, 'PickUpDate': '8/7/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1034, 'TruckCoGuid': '68d0d66a-1d23-56a1-a784-2198d6a270b7', 'PostingTruckCompanyId': 176281, 'PostGuid': '611eaaac-1a33-e8cc-b4a1-a04d5daeae3d', 'PostId': 1269873695, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'LONG BEACH', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 33.8, 'DestLon': -118.16, 'Length': ' ', 'Phone': '541-826-4786', 'CompanyName': 'SUREWAY ', 'Entered': 'Sun, 07 Aug 2016 09:01:43 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 80692, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/7/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1034, 'TruckCoGuid': '20091cec-85cc-c0f7-b305-4eb64b6fe7c5', 'PostingTruckCompanyId': 87179, 'PostGuid': '9cf482b5-e878-051d-7e23-18ba8bf38391', 'PostId': 1269873283, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'LONG BEACH', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 33.82, 'DestLon': -118.25, 'Length': ' ', 'Phone': '800-589-9842', 'CompanyName': 'INTERNAT', 'Entered': 'Sun, 07 Aug 2016 08:47:12 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1331300, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 501, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 669, 'TruckCoGuid': 'a31863d7-418c-29c6-8d5b-e7344076a252', 'PostingTruckCompanyId': 322356, 'PostGuid': '8ae42416-56d3-ebda-5c42-b818139de1f8', 'PostId': 1269872089, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MIST', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 46, 'OriginLat': 45.99, 'OriginLon': -123.33, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': ' ', 'Phone': '844-535-5237', 'CompanyName': 'UTI TRAN', 'Entered': 'Sun, 07 Aug 2016 08:32:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1209361, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 501, 'PickUpDate': '8/7/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 257, 'TruckCoGuid': '239526ab-50e8-e02c-804b-d4b0458c5774', 'PostingTruckCompanyId': 322358, 'PostGuid': 'bb3b1e8f-73b4-6d56-9edb-ad8209321fe8', 'PostId': 1269872150, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 50, 'OriginLat': 45.06, 'OriginLon': -123.48, 'DestCity': 'MEDFORD', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 42.31, 'DestLon': -122.87, 'Length': ' ', 'Phone': '719-387-0197', 'CompanyName': 'UTI TRAN', 'Entered': 'Sun, 07 Aug 2016 08:32:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1190979, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 501, 'PickUpDate': '8/7/2016', 'Weight': '65000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 257, 'TruckCoGuid': '239526ab-50e8-e02c-804b-d4b0458c5774', 'PostingTruckCompanyId': 322358, 'PostGuid': '4d689d6c-d58b-1816-a5bb-72738c8c8457', 'PostId': 1269872151, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 50, 'OriginLat': 45.06, 'OriginLon': -123.48, 'DestCity': 'MEDFORD', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 42.31, 'DestLon': -122.87, 'Length': ' ', 'Phone': '719-387-0197', 'CompanyName': 'UTI TRAN', 'Entered': 'Sun, 07 Aug 2016 08:32:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1190979, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 501, 'PickUpDate': '8/7/2016', 'Weight': ' ', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 332, 'TruckCoGuid': '8dea7d75-7c4a-b728-43dc-54979259596d', 'PostingTruckCompanyId': 200879, 'PostGuid': '5e925763-4762-8051-ee8d-d45574115a62', 'PostId': 1269872181, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'HOOD RIVER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 57, 'OriginLat': 45.69, 'OriginLon': -121.52, 'DestCity': 'PARMA', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.77, 'DestLon': -116.93, 'Length': ' ', 'Phone': '618-310-0092', 'CompanyName': 'UTI TRAN', 'Entered': 'Sun, 07 Aug 2016 08:32:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 73329, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 501, 'PickUpDate': '8/7/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1217, 'TruckCoGuid': 'ae93444d-a132-4011-6e44-897c60c0975d', 'PostingTruckCompanyId': 1908, 'PostGuid': '6839557b-7541-21c6-d550-9003e4f152ac', 'PostId': 1269872203, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'TIGARD', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 7, 'OriginLat': 45.44, 'OriginLon': -122.77, 'DestCity': 'RAPID CITY', 'DestState': 'SD', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.08, 'DestLon': -103.23, 'Length': ' ', 'Phone': '800-824-6297', 'CompanyName': 'UTI TRAN', 'Entered': 'Sun, 07 Aug 2016 08:32:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1197054, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 501, 'PickUpDate': '8/7/2016', 'Weight': ' ', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': '94a4a0be-be1d-95fe-2894-df987e4f874e', 'PostingTruckCompanyId': 277221, 'PostGuid': '6de7d68a-d36a-25dd-7b6d-8a0ff42d55e8', 'PostId': 1269872323, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.81, 'DestLon': -105.09, 'Length': ' ', 'Phone': '214-572-9465', 'CompanyName': 'UTI TRAN', 'Entered': 'Sun, 07 Aug 2016 08:32:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1197116, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 501, 'PickUpDate': '8/7/2016', 'Weight': ' ', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 617, 'TruckCoGuid': '8dea7d75-7c4a-b728-43dc-54979259596d', 'PostingTruckCompanyId': 200879, 'PostGuid': 'fc1b82ae-737f-42c3-148d-15d867fe4153', 'PostId': 1269872427, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'KALAMA', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 34, 'OriginLat': 45.99, 'OriginLon': -122.83, 'DestCity': 'SACRAMENTO', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.58, 'DestLon': -121.48, 'Length': ' ', 'Phone': '618-310-0092', 'CompanyName': 'UTI TRAN', 'Entered': 'Sun, 07 Aug 2016 08:32:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 73329, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 501, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 646, 'TruckCoGuid': '000d2f3a-0751-875a-b59b-bad676b0628a', 'PostingTruckCompanyId': 104033, 'PostGuid': 'ea6e85ac-e779-e298-b9e6-0cea2c35c228', 'PostId': 1269872446, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'NEWARK', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.51, 'DestLon': -122.03, 'Length': ' ', 'Phone': '877-895-4270', 'CompanyName': 'UTI TRAN', 'Entered': 'Sun, 07 Aug 2016 08:32:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1416836, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 501, 'PickUpDate': '8/7/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1210, 'TruckCoGuid': 'ae93444d-a132-4011-6e44-897c60c0975d', 'PostingTruckCompanyId': 1908, 'PostGuid': '37a4f195-d0e3-6f61-c10b-53d8be726a4a', 'PostId': 1269872593, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CHEHALIS', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 81, 'OriginLat': 46.66, 'OriginLon': -122.95, 'DestCity': 'RAPID CITY', 'DestState': 'SD', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.08, 'DestLon': -103.23, 'Length': ' ', 'Phone': '800-824-6297', 'CompanyName': 'UTI TRAN', 'Entered': 'Sun, 07 Aug 2016 08:32:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1197054, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 501, 'PickUpDate': '8/7/2016', 'Weight': ' ', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': '94a4a0be-be1d-95fe-2894-df987e4f874e', 'PostingTruckCompanyId': 277221, 'PostGuid': '425304ba-ccde-7bac-bf1b-d0851508f917', 'PostId': 1269872648, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39, 'DestLon': -104.7, 'Length': ' ', 'Phone': '214-572-9465', 'CompanyName': 'UTI TRAN', 'Entered': 'Sun, 07 Aug 2016 08:32:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1197116, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 501, 'PickUpDate': '8/7/2016', 'Weight': ' ', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 740, 'TruckCoGuid': 'c3e774da-cf04-6425-3522-ae60b76f88e6', 'PostingTruckCompanyId': 292507, 'PostGuid': '67abba56-3937-1d11-7544-0ad942a8a42d', 'PostId': 1269872844, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MORTON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 75, 'OriginLat': 46.55, 'OriginLon': -122.26, 'DestCity': 'IDAHO FALLS', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.51, 'DestLon': -111.92, 'Length': ' ', 'Phone': '800-547-2053', 'CompanyName': 'UTI TRAN', 'Entered': 'Sun, 07 Aug 2016 08:32:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 799819, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 501, 'PickUpDate': '8/7/2016', 'Weight': ' ', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1313, 'TruckCoGuid': '94a4a0be-be1d-95fe-2894-df987e4f874e', 'PostingTruckCompanyId': 277221, 'PostGuid': '6e6a1d7b-0fc5-3b3c-5e8e-259f980fddec', 'PostId': 1269872902, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'FLAGSTAFF', 'DestState': 'AZ', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.93, 'DestLon': -111.62, 'Length': ' ', 'Phone': '214-572-9465', 'CompanyName': 'UTI TRAN', 'Entered': 'Sun, 07 Aug 2016 08:32:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1197116, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 501, 'PickUpDate': '8/8/2016', 'Weight': '38000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 92, 'TruckCoGuid': '4a97818d-f11c-0c6f-1765-242b968a6131', 'PostingTruckCompanyId': 237359, 'PostGuid': 'df60d900-c0a2-aa3a-a836-8be895e6e100', 'PostId': 1269871480, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'SCAPPOOSE', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 19, 'OriginLat': 45.74, 'OriginLon': -122.87, 'DestCity': 'TILLAMOOK', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.44, 'DestLon': -123.83, 'Length': '48', 'Phone': '320-257-3803', 'CompanyName': 'TRINITY ', 'Entered': 'Sun, 07 Aug 2016 08:30:22 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 758152, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': '48000', 'Payment': '1300', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 643, 'TruckCoGuid': 'b4e52919-fbe6-1dc5-1077-8fac033cf4b6', 'PostingTruckCompanyId': 79496, 'PostGuid': '3601f008-fafa-582c-1462-50023a2c5f04', 'PostId': 1269870648, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'BINGEN', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 59, 'OriginLat': 45.71, 'OriginLon': -121.48, 'DestCity': 'IDAHO FALLS', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.51, 'DestLon': -111.92, 'Length': ' ', 'Phone': '801-621-6644', 'CompanyName': 'KONECNY ', 'Entered': 'Sun, 07 Aug 2016 06:00:17 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 35206, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': '48000', 'Payment': '1450', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 790, 'TruckCoGuid': 'b4e52919-fbe6-1dc5-1077-8fac033cf4b6', 'PostingTruckCompanyId': 79496, 'PostGuid': 'e1f4dfb2-d5fd-ee5a-ae39-1c32c0128de2', 'PostId': 1269870649, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CENTRALIA', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 84, 'OriginLat': 46.71, 'OriginLon': -122.95, 'DestCity': 'IDAHO FALLS', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.51, 'DestLon': -111.92, 'Length': ' ', 'Phone': '801-621-6644', 'CompanyName': 'KONECNY ', 'Entered': 'Sun, 07 Aug 2016 06:00:17 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 35206, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': '48000', 'Payment': '1525', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1313, 'TruckCoGuid': 'b4e52919-fbe6-1dc5-1077-8fac033cf4b6', 'PostingTruckCompanyId': 79496, 'PostGuid': 'e33a27c0-d4cf-817d-df8d-e5904bf49fb0', 'PostId': 1269870658, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'FLAGSTAFF', 'DestState': 'AZ', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.93, 'DestLon': -111.62, 'Length': ' ', 'Phone': '801-621-6644', 'CompanyName': 'KONECNY ', 'Entered': 'Sun, 07 Aug 2016 06:00:17 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 35206, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': '48000', 'Payment': '1425', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': 'b4e52919-fbe6-1dc5-1077-8fac033cf4b6', 'PostingTruckCompanyId': 79496, 'PostGuid': '62af48a1-a35b-fa3c-0d46-0728b7cf74fc', 'PostId': 1269870659, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.81, 'DestLon': -105.09, 'Length': ' ', 'Phone': '801-621-6644', 'CompanyName': 'KONECNY ', 'Entered': 'Sun, 07 Aug 2016 06:00:17 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 35206, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': '48000', 'Payment': '600', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 332, 'TruckCoGuid': 'b4e52919-fbe6-1dc5-1077-8fac033cf4b6', 'PostingTruckCompanyId': 79496, 'PostGuid': 'ef152d24-57c6-c621-e09c-b12506edab9b', 'PostId': 1269870679, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'HOOD RIVER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 57, 'OriginLat': 45.69, 'OriginLon': -121.52, 'DestCity': 'PARMA', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.77, 'DestLon': -116.93, 'Length': ' ', 'Phone': '801-621-6644', 'CompanyName': 'KONECNY ', 'Entered': 'Sun, 07 Aug 2016 06:00:17 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 35206, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': '48000', 'Payment': '950', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 646, 'TruckCoGuid': 'b4e52919-fbe6-1dc5-1077-8fac033cf4b6', 'PostingTruckCompanyId': 79496, 'PostGuid': '84f5ab9a-13a6-e9cf-93e2-728923840526', 'PostId': 1269870683, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'NEWARK', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.51, 'DestLon': -122.03, 'Length': ' ', 'Phone': '801-621-6644', 'CompanyName': 'KONECNY ', 'Entered': 'Sun, 07 Aug 2016 06:00:17 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 35206, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': '48000', 'Payment': '1900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1217, 'TruckCoGuid': 'b4e52919-fbe6-1dc5-1077-8fac033cf4b6', 'PostingTruckCompanyId': 79496, 'PostGuid': '525f1e50-901d-3fe6-28eb-cdd9522a66a5', 'PostId': 1269870687, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'TIGARD', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 7, 'OriginLat': 45.44, 'OriginLon': -122.77, 'DestCity': 'RAPID CITY', 'DestState': 'SD', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.08, 'DestLon': -103.23, 'Length': ' ', 'Phone': '801-621-6644', 'CompanyName': 'KONECNY ', 'Entered': 'Sun, 07 Aug 2016 06:00:17 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 35206, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': '48000', 'Payment': '1100', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 737, 'TruckCoGuid': 'b4e52919-fbe6-1dc5-1077-8fac033cf4b6', 'PostingTruckCompanyId': 79496, 'PostGuid': 'b1d1331e-6fab-7cab-3ec4-156232342e3a', 'PostId': 1269870694, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MOLALLA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 26, 'OriginLat': 45.14, 'OriginLon': -122.56, 'DestCity': 'FRESNO', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 36.74, 'DestLon': -119.8, 'Length': ' ', 'Phone': '801-621-6644', 'CompanyName': 'KONECNY ', 'Entered': 'Sun, 07 Aug 2016 06:00:17 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 35206, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': '48000', 'Payment': '1425', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 769, 'TruckCoGuid': 'b4e52919-fbe6-1dc5-1077-8fac033cf4b6', 'PostingTruckCompanyId': 79496, 'PostGuid': 'aa4139f3-9d59-1bf6-11ff-390de819ce79', 'PostId': 1269870710, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'SHERIDAN', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 46, 'OriginLat': 45.08, 'OriginLon': -123.39, 'DestCity': 'MALAD CITY', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 41.95, 'DestLon': -112.69, 'Length': ' ', 'Phone': '801-621-6644', 'CompanyName': 'KONECNY ', 'Entered': 'Sun, 07 Aug 2016 06:00:17 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 35206, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/14/2016', 'Weight': '5000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 170, 'TruckCoGuid': '108511c1-6fed-3b33-ef42-5e0b3284a5e7', 'PostingTruckCompanyId': 271989, 'PostGuid': '39ff3e85-3bd7-2107-ea11-e636743346eb', 'PostId': 1269870622, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CHEHALIS', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 81, 'OriginLat': 46.66, 'OriginLon': -122.95, 'DestCity': 'TOPPENISH', 'DestState': 'WA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 46.36, 'DestLon': -120.3, 'Length': '', 'Phone': 'Bid_Online', 'CompanyName': 'SEE LOAD', 'Entered': 'Sun, 07 Aug 2016 05:38:36 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1311291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': '20000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 246, 'TruckCoGuid': '108511c1-6fed-3b33-ef42-5e0b3284a5e7', 'PostingTruckCompanyId': 271989, 'PostGuid': '1a11d4ee-b458-2211-d571-c78d5fa69cfa', 'PostId': 1269870519, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CLACKAMAS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 13, 'OriginLat': 45.38, 'OriginLon': -122.49, 'DestCity': 'GRANTS PASS', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 42.43, 'DestLon': -123.31, 'Length': '', 'Phone': 'Bid_Online', 'CompanyName': 'SEE LOAD', 'Entered': 'Sun, 07 Aug 2016 05:37:07 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1311291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': '9800', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 37, 'TruckCoGuid': '108511c1-6fed-3b33-ef42-5e0b3284a5e7', 'PostingTruckCompanyId': 271989, 'PostGuid': 'f0f0ff45-60f5-a341-3276-d7793bc00403', 'PostId': 1269870483, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CHEHALIS', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 81, 'OriginLat': 46.66, 'OriginLon': -122.95, 'DestCity': 'ELMA', 'DestState': 'WA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 46.99, 'DestLon': -123.39, 'Length': '', 'Phone': 'Bid_Online', 'CompanyName': 'SEE LOAD', 'Entered': 'Sun, 07 Aug 2016 05:36:39 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1311291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': '18000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 893, 'TruckCoGuid': '108511c1-6fed-3b33-ef42-5e0b3284a5e7', 'PostingTruckCompanyId': 271989, 'PostGuid': 'c1f7f353-29f5-1548-75d9-6f088570ccad', 'PostId': 1269870390, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CHEHALIS', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 81, 'OriginLat': 46.66, 'OriginLon': -122.95, 'DestCity': 'SPRINGVILLE', 'DestState': 'UT', 'DestCtry': '', 'DestDist': 0, 'DestLat': 40.13, 'DestLon': -111.59, 'Length': '', 'Phone': 'Bid_Online', 'CompanyName': 'SEE LOAD', 'Entered': 'Sun, 07 Aug 2016 05:35:15 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1311291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/9/2016', 'Weight': '22900', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1167, 'TruckCoGuid': '108511c1-6fed-3b33-ef42-5e0b3284a5e7', 'PostingTruckCompanyId': 271989, 'PostGuid': 'de2e9502-6080-5bea-c77c-49e9c3b6f1b6', 'PostId': 1269870215, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CHEHALIS', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 81, 'OriginLat': 46.66, 'OriginLon': -122.95, 'DestCity': 'SAN DIEGO', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 32.74, 'DestLon': -117.1, 'Length': '', 'Phone': 'Bid_Online', 'CompanyName': 'SEE LOAD', 'Entered': 'Sun, 07 Aug 2016 05:33:05 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1311291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': '661', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1167, 'TruckCoGuid': '108511c1-6fed-3b33-ef42-5e0b3284a5e7', 'PostingTruckCompanyId': 271989, 'PostGuid': 'bc24d49f-b4ab-7b97-5546-478b9b1af9c8', 'PostId': 1269870211, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CHEHALIS', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 81, 'OriginLat': 46.66, 'OriginLon': -122.95, 'DestCity': 'SAN DIEGO', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 32.74, 'DestLon': -117.1, 'Length': '', 'Phone': 'Bid_Online', 'CompanyName': 'SEE LOAD', 'Entered': 'Sun, 07 Aug 2016 05:33:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1311291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/31/2016', 'Weight': '211644', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 70, 'TruckCoGuid': '108511c1-6fed-3b33-ef42-5e0b3284a5e7', 'PostingTruckCompanyId': 271989, 'PostGuid': '34e8ec3a-d14f-d6fa-6b7d-1c7900ded8b5', 'PostId': 1269870153, 'EquipmentType': 'VF', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'LYONS', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.78, 'DestLon': -122.61, 'Length': '', 'Phone': 'Bid_Online', 'CompanyName': 'SEE LOAD', 'Entered': 'Sun, 07 Aug 2016 05:32:17 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1311291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': '15000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 2935, 'TruckCoGuid': '108511c1-6fed-3b33-ef42-5e0b3284a5e7', 'PostingTruckCompanyId': 271989, 'PostGuid': 'b533299c-75de-bf41-f676-d663aa0aa640', 'PostId': 1269870032, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'STAMFORD', 'DestState': 'CT', 'DestCtry': '', 'DestDist': 0, 'DestLat': 41.06, 'DestLon': -73.54, 'Length': '', 'Phone': 'Bid_Online', 'CompanyName': 'SEE LOAD', 'Entered': 'Sun, 07 Aug 2016 05:30:45 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1311291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': '300', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 2508, 'TruckCoGuid': '108511c1-6fed-3b33-ef42-5e0b3284a5e7', 'PostingTruckCompanyId': 271989, 'PostGuid': '8b07c9cd-f33a-2e1d-3adb-84bb40731645', 'PostId': 1269870022, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'KELSO', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 45, 'OriginLat': 46.14, 'OriginLon': -122.9, 'DestCity': 'HUDSON', 'DestState': 'OH', 'DestCtry': '', 'DestDist': 0, 'DestLat': 41.23, 'DestLon': -81.44, 'Length': '', 'Phone': 'Bid_Online', 'CompanyName': 'SEE LOAD', 'Entered': 'Sun, 07 Aug 2016 05:30:37 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1311291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': '2300', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 2845, 'TruckCoGuid': '108511c1-6fed-3b33-ef42-5e0b3284a5e7', 'PostingTruckCompanyId': 271989, 'PostGuid': '0303c3cb-c6eb-3e86-0800-531764ce8688', 'PostId': 1269870002, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CHEHALIS', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 81, 'OriginLat': 46.66, 'OriginLon': -122.95, 'DestCity': 'MANASSAS', 'DestState': 'VA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.74, 'DestLon': -77.48, 'Length': '', 'Phone': 'Bid_Online', 'CompanyName': 'SEE LOAD', 'Entered': 'Sun, 07 Aug 2016 05:30:21 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1311291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': '45000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 545, 'TruckCoGuid': '108511c1-6fed-3b33-ef42-5e0b3284a5e7', 'PostingTruckCompanyId': 271989, 'PostGuid': 'ef21ef9f-f6d2-5da9-d05e-59e16357f2a6', 'PostId': 1269869989, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CHEHALIS', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 81, 'OriginLat': 46.66, 'OriginLon': -122.95, 'DestCity': 'MISSOULA', 'DestState': 'MT', 'DestCtry': '', 'DestDist': 0, 'DestLat': 46.87, 'DestLon': -114.01, 'Length': '', 'Phone': 'Bid_Online', 'CompanyName': 'SEE LOAD', 'Entered': 'Sun, 07 Aug 2016 05:30:10 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1311291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': '8000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 2112, 'TruckCoGuid': '108511c1-6fed-3b33-ef42-5e0b3284a5e7', 'PostingTruckCompanyId': 271989, 'PostGuid': 'bd152da5-ac1f-570c-ce53-3f0bef916c9c', 'PostId': 1269869945, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'WAPELLA', 'DestState': 'IL', 'DestCtry': '', 'DestDist': 0, 'DestLat': 40.21, 'DestLon': -88.96, 'Length': '', 'Phone': 'Bid_Online', 'CompanyName': 'SEE LOAD', 'Entered': 'Sun, 07 Aug 2016 05:29:38 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1311291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': '8000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 2112, 'TruckCoGuid': '108511c1-6fed-3b33-ef42-5e0b3284a5e7', 'PostingTruckCompanyId': 271989, 'PostGuid': '6745fd62-36c9-0d66-5c8a-4d7df47c6356', 'PostId': 1269869943, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'WAPELLA', 'DestState': 'IL', 'DestCtry': '', 'DestDist': 0, 'DestLat': 40.21, 'DestLon': -88.96, 'Length': '', 'Phone': 'Bid_Online', 'CompanyName': 'SEE LOAD', 'Entered': 'Sun, 07 Aug 2016 05:29:37 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1311291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '15200', 'Payment': '2200', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1335, 'TruckCoGuid': '6c2186cb-8381-c344-2bcb-d94d0c5bf42d', 'PostingTruckCompanyId': 342093, 'PostGuid': 'edd11959-3937-2d6c-6e35-d70f98c11568', 'PostId': 1269869597, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WARRENTON', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 74, 'OriginLat': 46.15, 'OriginLon': -123.91, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.75, 'DestLon': -104.99, 'Length': '0', 'Phone': '205-213-6685', 'CompanyName': 'JONES MO', 'Entered': 'Sun, 07 Aug 2016 04:13:56 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1751268, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/7/2016', 'Weight': '15200', 'Payment': '2200', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1335, 'TruckCoGuid': '6c2186cb-8381-c344-2bcb-d94d0c5bf42d', 'PostingTruckCompanyId': 342093, 'PostGuid': 'e0753c7d-0acc-266a-2a6a-152c5b275c30', 'PostId': 1269863040, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WARRENTON', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 74, 'OriginLat': 46.15, 'OriginLon': -123.91, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.75, 'DestLon': -104.99, 'Length': '0', 'Phone': '205-213-6685', 'CompanyName': 'JONES MO', 'Entered': 'Sun, 07 Aug 2016 04:13:39 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1751268, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/10/2016', 'Weight': '40000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 2510, 'TruckCoGuid': '537b96be-db4f-6cda-777b-c6331c909a34', 'PostingTruckCompanyId': 254008, 'PostGuid': '25e34f39-d2a3-5a78-b68b-75cbdb0e8c05', 'PostId': 1269398004, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'HARRISBURG', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 89, 'OriginLat': 44.27, 'OriginLon': -123.15, 'DestCity': 'SHEFFIELD', 'DestState': 'AL', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.75, 'DestLon': -87.69, 'Length': '0', 'Phone': '630-221-0400 ', 'CompanyName': 'SATURN F', 'Entered': 'Sun, 07 Aug 2016 02:22:05 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1207129, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1726, 'TruckCoGuid': '16a5a9ec-f8df-7377-04f4-38f2d15268f5', 'PostingTruckCompanyId': 167945, 'PostGuid': '19659a12-44d5-7427-da0c-ebcd06613a77', 'PostId': 1269506690, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CULVER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 99, 'OriginLat': 44.51, 'OriginLon': -121.21, 'DestCity': 'BROWNTON', 'DestState': 'MN', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.72, 'DestLon': -94.35, 'Length': '', 'Phone': '800-321-7182', 'CompanyName': 'FAK INC ', 'Entered': 'Sun, 07 Aug 2016 02:22:05 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 115050, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 503, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 625, 'TruckCoGuid': 'ad9cbde3-e183-c4f0-51d8-78e627a2cbde', 'PostingTruckCompanyId': 328594, 'PostGuid': '9dcac037-db6e-592e-df5f-9846cb8c29ff', 'PostId': 1269407846, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'SPARKS', 'DestState': 'NV', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.57, 'DestLon': -119.7, 'Length': '48', 'Phone': '941-764-8383', 'CompanyName': 'FIRST ST', 'Entered': 'Sun, 07 Aug 2016 02:12:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1503773, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 503, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 625, 'TruckCoGuid': 'ad9cbde3-e183-c4f0-51d8-78e627a2cbde', 'PostingTruckCompanyId': 328594, 'PostGuid': '07e04bba-01ae-7f96-a4fd-fc64f6930d86', 'PostId': 1269698989, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'SPARKS', 'DestState': 'NV', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.57, 'DestLon': -119.7, 'Length': '48', 'Phone': '941-764-8383', 'CompanyName': 'FIRST ST', 'Entered': 'Sun, 07 Aug 2016 02:12:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1503773, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 625, 'TruckCoGuid': '035a8c18-4acb-9ac6-a60a-ddc2889950e0', 'PostingTruckCompanyId': 254957, 'PostGuid': '3b9d69fd-2b88-1e78-c533-0d69bce0af27', 'PostId': 1269794388, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'SPARKS', 'DestState': 'NV', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.57, 'DestLon': -119.7, 'Length': '48', 'Phone': '402-991-1641', 'CompanyName': 'KLC LOGI', 'Entered': 'Sun, 07 Aug 2016 02:12:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 510221, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '64000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 817, 'TruckCoGuid': '16a5a9ec-f8df-7377-04f4-38f2d15268f5', 'PostingTruckCompanyId': 167945, 'PostGuid': 'ffa266b5-a5b7-c38f-a9f2-03501256a2b4', 'PostId': 1269347203, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'NAPAVINE', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 74, 'OriginLat': 46.57, 'OriginLon': -122.89, 'DestCity': 'LAYTON', 'DestState': 'UT', 'DestCtry': '', 'DestDist': 0, 'DestLat': 41.05, 'DestLon': -111.96, 'Length': '', 'Phone': '800-321-7182', 'CompanyName': 'FAK INC ', 'Entered': 'Sun, 07 Aug 2016 02:11:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 115050, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 799, 'TruckCoGuid': '10c6da1c-c680-aac3-e05a-c69562710296', 'PostingTruckCompanyId': 254961, 'PostGuid': 'fa24a5cc-3ea2-4696-f942-40d345e19542', 'PostId': 1269658202, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WARRENTON', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 74, 'OriginLat': 46.15, 'OriginLon': -123.91, 'DestCity': 'IDAHO FALLS', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.51, 'DestLon': -111.92, 'Length': '48', 'Phone': '217-469-2158', 'CompanyName': 'KLC LOGI', 'Entered': 'Sat, 06 Aug 2016 23:41:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1206874, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '0', 'Payment': '1440', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 799, 'TruckCoGuid': 'b7df6b7a-4380-7fa7-4c1b-7cc3b9c8c202', 'PostingTruckCompanyId': 85917, 'PostGuid': '04ac7d62-1b53-74e3-644a-5e55a6fb951f', 'PostId': 1269724752, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WARRENTON', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 74, 'OriginLat': 46.15, 'OriginLon': -123.91, 'DestCity': 'IDAHO FALLS', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.51, 'DestLon': -111.92, 'Length': '48', 'Phone': '800-956-1151', 'CompanyName': 'JONES TR', 'Entered': 'Sat, 06 Aug 2016 23:41:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 21015, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': '0', 'Payment': '1440', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 799, 'TruckCoGuid': 'b7df6b7a-4380-7fa7-4c1b-7cc3b9c8c202', 'PostingTruckCompanyId': 85917, 'PostGuid': '33708f9a-26c0-a69a-2e1d-3ab5975da1ff', 'PostId': 1269724753, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WARRENTON', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 74, 'OriginLat': 46.15, 'OriginLon': -123.91, 'DestCity': 'IDAHO FALLS', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.51, 'DestLon': -111.92, 'Length': '48', 'Phone': '800-956-1151', 'CompanyName': 'JONES TR', 'Entered': 'Sat, 06 Aug 2016 23:41:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 21015, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '150', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 48, 'TruckCoGuid': '22ef81e4-9a09-6511-7659-3dabbd24ba93', 'PostingTruckCompanyId': 101680, 'PostGuid': '41959736-346d-3f92-2671-943b23b67bf7', 'PostId': 1269331647, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LONGVIEW', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 45, 'OriginLat': 46.14, 'OriginLon': -122.9, 'DestCity': 'PORTLAND', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.51, 'DestLon': -122.67, 'Length': '0', 'Phone': '877-638-8656', 'CompanyName': 'JORDAN L', 'Entered': 'Sat, 06 Aug 2016 09:29:54 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 170449, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '350', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 99, 'TruckCoGuid': '22ef81e4-9a09-6511-7659-3dabbd24ba93', 'PostingTruckCompanyId': 101680, 'PostGuid': '30ef101e-e124-44d4-8842-61672ea50fdd', 'PostId': 1269550465, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'DALLESPORT', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 73, 'OriginLat': 45.6, 'OriginLon': -121.16, 'DestCity': 'ALOHA', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.48, 'DestLon': -122.85, 'Length': '0', 'Phone': '877-638-8656', 'CompanyName': 'JORDAN L', 'Entered': 'Sat, 06 Aug 2016 09:29:54 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 170449, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1246, 'TruckCoGuid': '16a5a9ec-f8df-7377-04f4-38f2d15268f5', 'PostingTruckCompanyId': 167945, 'PostGuid': '20ff435c-0585-7a41-58d5-42f8282506aa', 'PostId': 1269601581, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MCMINNVILLE', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 36, 'OriginLat': 45.19, 'OriginLon': -123.26, 'DestCity': 'RAPID CITY', 'DestState': 'SD', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.08, 'DestLon': -103.23, 'Length': '', 'Phone': '800-321-7182', 'CompanyName': 'FAK INC ', 'Entered': 'Sat, 06 Aug 2016 05:53:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 115050, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1888, 'TruckCoGuid': '16a5a9ec-f8df-7377-04f4-38f2d15268f5', 'PostingTruckCompanyId': 167945, 'PostGuid': 'c4946ea2-47b7-cc33-272b-8ff95ed02e0a', 'PostId': 1269345207, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WARRENTON', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 74, 'OriginLat': 46.15, 'OriginLon': -123.91, 'DestCity': 'MIDLAND', 'DestState': 'TX', 'DestCtry': '', 'DestDist': 0, 'DestLat': 31.98, 'DestLon': -102.07, 'Length': '', 'Phone': '800-321-7182', 'CompanyName': 'FAK INC ', 'Entered': 'Sat, 06 Aug 2016 05:53:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 115050, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '64000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1160, 'TruckCoGuid': '16a5a9ec-f8df-7377-04f4-38f2d15268f5', 'PostingTruckCompanyId': 167945, 'PostGuid': '3ea97468-b1f6-af48-0a34-1c3184bf8e80', 'PostId': 1269346974, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'NAPAVINE', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 74, 'OriginLat': 46.57, 'OriginLon': -122.89, 'DestCity': 'CASPER', 'DestState': 'WY', 'DestCtry': '', 'DestDist': 0, 'DestLat': 42.85, 'DestLon': -106.32, 'Length': '', 'Phone': '800-321-7182', 'CompanyName': 'FAK INC ', 'Entered': 'Sat, 06 Aug 2016 05:53:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 115050, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 578, 'TruckCoGuid': '16a5a9ec-f8df-7377-04f4-38f2d15268f5', 'PostingTruckCompanyId': 167945, 'PostGuid': '628b4509-d2ab-085b-9046-ad858bd4b532', 'PostId': 1269241563, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'ROSEVILLE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.74, 'DestLon': -121.29, 'Length': '53', 'Phone': '800-321-7182', 'CompanyName': 'FAK INC ', 'Entered': 'Sat, 06 Aug 2016 05:53:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 115050, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '64000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 99, 'TruckCoGuid': '16a5a9ec-f8df-7377-04f4-38f2d15268f5', 'PostingTruckCompanyId': 167945, 'PostGuid': '88591149-e053-3080-106f-23904a308cb9', 'PostId': 1269243446, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MONROE', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 89, 'OriginLat': 44.3, 'OriginLon': -123.28, 'DestCity': 'PORTLAND', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.51, 'DestLon': -122.67, 'Length': '', 'Phone': '800-321-7182', 'CompanyName': 'FAK INC ', 'Entered': 'Sat, 06 Aug 2016 05:53:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 115050, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '64000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 215, 'TruckCoGuid': '16a5a9ec-f8df-7377-04f4-38f2d15268f5', 'PostingTruckCompanyId': 167945, 'PostGuid': 'ac5764db-7123-02ce-f175-e3f23b4701aa', 'PostId': 1269245738, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'TILLAMOOK', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.44, 'OriginLon': -123.83, 'DestCity': 'TACOMA', 'DestState': 'WA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 47.19, 'DestLon': -122.48, 'Length': '', 'Phone': '800-321-7182', 'CompanyName': 'FAK INC ', 'Entered': 'Sat, 06 Aug 2016 05:53:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 115050, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '64000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 169, 'TruckCoGuid': '16a5a9ec-f8df-7377-04f4-38f2d15268f5', 'PostingTruckCompanyId': 167945, 'PostGuid': '04df7f4e-2dc4-50fb-b931-ba78a5244d53', 'PostId': 1269246158, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'WINSTON', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.1, 'DestLon': -123.41, 'Length': '', 'Phone': '800-321-7182', 'CompanyName': 'FAK INC ', 'Entered': 'Sat, 06 Aug 2016 05:53:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 115050, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '64000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 190, 'TruckCoGuid': '16a5a9ec-f8df-7377-04f4-38f2d15268f5', 'PostingTruckCompanyId': 167945, 'PostGuid': '312714a0-2c41-637f-4b43-f22e1eaec527', 'PostId': 1269616262, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MORTON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 75, 'OriginLat': 46.55, 'OriginLon': -122.26, 'DestCity': 'PASCO', 'DestState': 'WA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 46.22, 'DestLon': -119.08, 'Length': '', 'Phone': '800-321-7182', 'CompanyName': 'FAK INC ', 'Entered': 'Sat, 06 Aug 2016 05:53:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 115050, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '64000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 163, 'TruckCoGuid': '16a5a9ec-f8df-7377-04f4-38f2d15268f5', 'PostingTruckCompanyId': 167945, 'PostGuid': 'cff38217-59bf-e62c-70c7-23f3f796ccad', 'PostId': 1269772107, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LONGVIEW', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 45, 'OriginLat': 46.14, 'OriginLon': -122.9, 'DestCity': 'MADRAS', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.62, 'DestLon': -121.12, 'Length': '', 'Phone': '800-321-7182', 'CompanyName': 'FAK INC ', 'Entered': 'Sat, 06 Aug 2016 05:53:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 115050, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 737, 'TruckCoGuid': '16a5a9ec-f8df-7377-04f4-38f2d15268f5', 'PostingTruckCompanyId': 167945, 'PostGuid': 'b657cba2-6d25-424d-0dc9-912eaecd4071', 'PostId': 1269774371, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WARRENTON', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 74, 'OriginLat': 46.15, 'OriginLon': -123.91, 'DestCity': 'MODESTO', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.65, 'DestLon': -120.99, 'Length': '', 'Phone': '800-321-7182', 'CompanyName': 'FAK INC ', 'Entered': 'Sat, 06 Aug 2016 05:53:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 115050, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 524, 'TruckCoGuid': '16a5a9ec-f8df-7377-04f4-38f2d15268f5', 'PostingTruckCompanyId': 167945, 'PostGuid': '1109f7fb-0e4f-c49c-2f25-e5e9371a1373', 'PostId': 1269774954, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'OLIVEHURST', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.09, 'DestLon': -121.55, 'Length': '', 'Phone': '800-321-7182', 'CompanyName': 'FAK INC ', 'Entered': 'Sat, 06 Aug 2016 05:53:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 115050, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 579, 'TruckCoGuid': '16a5a9ec-f8df-7377-04f4-38f2d15268f5', 'PostingTruckCompanyId': 167945, 'PostGuid': 'a299b3d0-e681-6d60-a467-bfa9ad225dfb', 'PostId': 1269775033, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'ELK GROVE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.39, 'DestLon': -121.37, 'Length': '', 'Phone': '800-321-7182', 'CompanyName': 'FAK INC ', 'Entered': 'Sat, 06 Aug 2016 05:53:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 115050, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 928, 'TruckCoGuid': '16a5a9ec-f8df-7377-04f4-38f2d15268f5', 'PostingTruckCompanyId': 167945, 'PostGuid': 'fae42292-21c0-60df-70cf-d6e867ae1561', 'PostId': 1269775136, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'GOLETA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.46, 'DestLon': -119.8, 'Length': '', 'Phone': '800-321-7182', 'CompanyName': 'FAK INC ', 'Entered': 'Sat, 06 Aug 2016 05:53:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 115050, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '64000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 127, 'TruckCoGuid': '16a5a9ec-f8df-7377-04f4-38f2d15268f5', 'PostingTruckCompanyId': 167945, 'PostGuid': '4bcb4b98-9473-6f9e-5972-e33bf008442d', 'PostId': 1269820188, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'HOOD RIVER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 57, 'OriginLat': 45.69, 'OriginLon': -121.52, 'DestCity': 'GRANDVIEW', 'DestState': 'WA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 46.25, 'DestLon': -119.89, 'Length': '', 'Phone': '800-321-7182', 'CompanyName': 'FAK INC ', 'Entered': 'Sat, 06 Aug 2016 05:53:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 115050, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 966, 'TruckCoGuid': '16a5a9ec-f8df-7377-04f4-38f2d15268f5', 'PostingTruckCompanyId': 167945, 'PostGuid': 'ef60941b-808d-2f07-b699-235abc8c42a1', 'PostId': 1269728570, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'TURNER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 52, 'OriginLat': 44.79, 'OriginLon': -122.94, 'DestCity': 'COLTON', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.03, 'DestLon': -117.31, 'Length': '', 'Phone': '800-321-7182', 'CompanyName': 'FAK INC ', 'Entered': 'Sat, 06 Aug 2016 05:53:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 115050, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '325', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 99, 'TruckCoGuid': '4b2d90b7-1f87-731e-8d45-767b1ad575fb', 'PostingTruckCompanyId': 289960, 'PostGuid': '9c9e9626-3747-bccc-9a57-221edb763a55', 'PostId': 1269731758, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'DALLESPORT', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 73, 'OriginLat': 45.6, 'OriginLon': -121.16, 'DestCity': 'ALOHA', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.48, 'DestLon': -122.85, 'Length': '48', 'Phone': '216-322-5665', 'CompanyName': 'BROOKS B', 'Entered': 'Sat, 06 Aug 2016 02:25:43 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 777527, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 503, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 48, 'TruckCoGuid': 'ad9cbde3-e183-c4f0-51d8-78e627a2cbde', 'PostingTruckCompanyId': 328594, 'PostGuid': '3ef3eb41-fce6-78b6-e63b-e481c2e621e3', 'PostId': 1269699371, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LONGVIEW', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 45, 'OriginLat': 46.14, 'OriginLon': -122.9, 'DestCity': 'PORTLAND', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.51, 'DestLon': -122.67, 'Length': '48', 'Phone': '941-764-8383', 'CompanyName': 'FIRST ST', 'Entered': 'Sat, 06 Aug 2016 02:09:22 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1503773, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '38000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1266, 'TruckCoGuid': 'd84c93ae-1751-8ccd-906e-641f1f419e82', 'PostingTruckCompanyId': 288445, 'PostGuid': '91b0ff86-621b-a312-2057-31941749808d', 'PostId': 1268603448, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MOLALLA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 26, 'OriginLat': 45.14, 'OriginLon': -122.56, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.75, 'DestLon': -104.99, 'Length': '48', 'Phone': '615-647-6833', 'CompanyName': 'PROPAK L', 'Entered': 'Sat, 06 Aug 2016 01:49:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1132128, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '38000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1266, 'TruckCoGuid': 'd84c93ae-1751-8ccd-906e-641f1f419e82', 'PostingTruckCompanyId': 288445, 'PostGuid': '436a5c8b-eb18-b303-dd9c-cec78a3a290c', 'PostId': 1269457816, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MOLALLA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 26, 'OriginLat': 45.14, 'OriginLon': -122.56, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.75, 'DestLon': -104.99, 'Length': '48', 'Phone': '615-647-6833', 'CompanyName': 'PROPAK L', 'Entered': 'Sat, 06 Aug 2016 01:49:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1132128, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '150', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 48, 'TruckCoGuid': '04596748-4f36-5bf7-eec7-42159c44809d', 'PostingTruckCompanyId': 336012, 'PostGuid': 'bace5f08-4cb7-64ed-0561-546c480e9866', 'PostId': 1269510390, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LONGVIEW', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 45, 'OriginLat': 46.14, 'OriginLon': -122.9, 'DestCity': 'PORTLAND', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.51, 'DestLon': -122.67, 'Length': '48', 'Phone': '541-636-3977', 'CompanyName': 'EAGLE TR', 'Entered': 'Sat, 06 Aug 2016 01:20:11 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1698943, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1400', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1036, 'TruckCoGuid': '04596748-4f36-5bf7-eec7-42159c44809d', 'PostingTruckCompanyId': 336012, 'PostGuid': 'a0950e49-e164-d263-a80a-9c33505bac89', 'PostId': 1269509309, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'HOOD RIVER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 57, 'OriginLat': 45.69, 'OriginLon': -121.52, 'DestCity': 'ROMOLAND', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 33.7, 'DestLon': -117.18, 'Length': '48', 'Phone': '541-636-3977', 'CompanyName': 'EAGLE TR', 'Entered': 'Sat, 06 Aug 2016 01:20:11 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1698943, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1450', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': '04596748-4f36-5bf7-eec7-42159c44809d', 'PostingTruckCompanyId': 336012, 'PostGuid': 'bc93add1-fa5a-6dd4-62f2-a65615772c3a', 'PostId': 1269441751, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.75, 'DestLon': -104.99, 'Length': '48', 'Phone': '541-636-3977', 'CompanyName': 'EAGLE TR', 'Entered': 'Sat, 06 Aug 2016 01:20:11 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1698943, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1550', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': '04596748-4f36-5bf7-eec7-42159c44809d', 'PostingTruckCompanyId': 336012, 'PostGuid': '211b65a6-1802-3f8f-026e-577ab1df15e4', 'PostId': 1269445256, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.82, 'DestLon': -104.75, 'Length': '48', 'Phone': '541-636-3977', 'CompanyName': 'EAGLE TR', 'Entered': 'Sat, 06 Aug 2016 01:20:11 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1698943, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '2400', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 2013, 'TruckCoGuid': '04596748-4f36-5bf7-eec7-42159c44809d', 'PostingTruckCompanyId': 336012, 'PostGuid': '36eb8a17-8d2f-6458-cd81-c72adddc58de', 'PostId': 1269425251, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'HARRISBURG', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 89, 'OriginLat': 44.27, 'OriginLon': -123.15, 'DestCity': 'SCHOFIELD', 'DestState': 'WI', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.89, 'DestLon': -89.6, 'Length': '48', 'Phone': '541-636-3977', 'CompanyName': 'EAGLE TR', 'Entered': 'Sat, 06 Aug 2016 01:20:11 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1698943, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '850', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 625, 'TruckCoGuid': '04596748-4f36-5bf7-eec7-42159c44809d', 'PostingTruckCompanyId': 336012, 'PostGuid': 'd4bbb292-4121-aeec-6cf5-e4a8c7f85a06', 'PostId': 1269702747, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'SPARKS', 'DestState': 'NV', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.57, 'DestLon': -119.7, 'Length': '48', 'Phone': '541-636-3977', 'CompanyName': 'EAGLE TR', 'Entered': 'Sat, 06 Aug 2016 01:20:11 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1698943, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1500', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1313, 'TruckCoGuid': '04596748-4f36-5bf7-eec7-42159c44809d', 'PostingTruckCompanyId': 336012, 'PostGuid': 'd9df48d5-e365-a52e-ddca-f904bcb7aa40', 'PostId': 1269762593, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'FLAGSTAFF', 'DestState': 'AZ', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.93, 'DestLon': -111.62, 'Length': '48', 'Phone': '541-636-3977', 'CompanyName': 'EAGLE TR', 'Entered': 'Sat, 06 Aug 2016 01:20:11 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1698943, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '1650', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 992, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '0acb8193-8e89-7abb-ddf7-ae746d9f993d', 'PostId': 1269503423, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'TILLAMOOK', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.44, 'OriginLon': -123.83, 'DestCity': 'LOS ANGELES', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.06, 'DestLon': -118.3, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Sat, 06 Aug 2016 00:58:48 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '1400', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 862, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '8ba4d51d-049b-e40b-0897-ea6a2d7670fa', 'PostId': 1269207164, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'SANTA MARIA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.86, 'DestLon': -120.35, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Sat, 06 Aug 2016 00:58:48 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '1150', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 650, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': 'd236e977-319c-7f19-498e-e3e633da9b68', 'PostId': 1269600872, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'SUNNYVALE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.38, 'DestLon': -122.01, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Sat, 06 Aug 2016 00:58:48 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '1300', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 862, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '5c275b21-86cc-5225-e1e4-c3595b8ee956', 'PostId': 1269216887, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'SANTA MARIA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.86, 'DestLon': -120.35, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Sat, 06 Aug 2016 00:58:48 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '1000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 563, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '04a9d60a-a76b-323b-e727-7423902d60c4', 'PostId': 1269274853, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'SACRAMENTO', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.58, 'DestLon': -121.48, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Sat, 06 Aug 2016 00:58:48 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '950', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 578, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': 'db2dddac-2dc8-f726-f2f1-45b5b6a6ceb1', 'PostId': 1269207165, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'ROSEVILLE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.74, 'DestLon': -121.29, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Sat, 06 Aug 2016 00:58:48 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '1600', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 954, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': 'fc2f285d-67f2-913f-9443-e752b48ab55e', 'PostId': 1268954146, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'LOS ANGELES', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.06, 'DestLon': -118.3, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Sat, 06 Aug 2016 00:58:48 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '1000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 524, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '7493fd97-62bf-0a96-b53b-f4f80190ef19', 'PostId': 1269599840, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'OLIVEHURST', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.09, 'DestLon': -121.55, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Sat, 06 Aug 2016 00:58:48 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '1000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 615, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': 'ab8c740f-0d2b-18a4-1e78-0e11c774cae5', 'PostId': 1268945154, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'MARTINEZ', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38, 'DestLon': -122.12, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Sat, 06 Aug 2016 00:57:36 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '950', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 615, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '8a44f423-3cf8-88df-fff8-dfde98b2935d', 'PostId': 1268780318, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'MARTINEZ', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38, 'DestLon': -122.12, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Sat, 06 Aug 2016 00:57:36 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '950', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 627, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': 'c9e3ddbb-f8ff-0db9-63d7-6a6783dbe338', 'PostId': 1268780601, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'STOCKTON', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.96, 'DestLon': -121.28, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Sat, 06 Aug 2016 00:57:36 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '1300', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 694, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': 'ef7562b7-d588-658b-2f8f-af5bf4546544', 'PostId': 1269353753, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RANDLE', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 78, 'OriginLat': 46.52, 'OriginLon': -121.94, 'DestCity': 'UKIAH', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.14, 'DestLon': -123.19, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Sat, 06 Aug 2016 00:57:36 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '1100', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 657, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '291036b2-bac4-eede-21f7-824e43dfa8ed', 'PostId': 1269352755, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'RIVERBANK', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.73, 'DestLon': -120.93, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Sat, 06 Aug 2016 00:57:36 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/8/2016', 'Weight': '47500', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 99, 'TruckCoGuid': 'b999d698-4e7e-10c0-9947-0b395262a5f3', 'PostingTruckCompanyId': 293208, 'PostGuid': '2ad19ba2-a180-d9ab-5720-67c9de860703', 'PostId': 1269546622, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'DALLESPORT', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 73, 'OriginLat': 45.6, 'OriginLon': -121.16, 'DestCity': 'ALOHA', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.48, 'DestLon': -122.85, 'Length': '0', 'Phone': '801-981-4883', 'CompanyName': 'A-1 FREI', 'Entered': 'Sat, 06 Aug 2016 00:31:32 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1037838, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/8/2016', 'Weight': '47500', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1217, 'TruckCoGuid': 'b999d698-4e7e-10c0-9947-0b395262a5f3', 'PostingTruckCompanyId': 293208, 'PostGuid': '34077cbf-3e79-82b8-c9df-35c6e83d000c', 'PostId': 1269260312, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'TIGARD', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 7, 'OriginLat': 45.44, 'OriginLon': -122.77, 'DestCity': 'RAPID CITY', 'DestState': 'SD', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.08, 'DestLon': -103.23, 'Length': '0', 'Phone': '801-981-4883', 'CompanyName': 'A-1 FREI', 'Entered': 'Sat, 06 Aug 2016 00:31:32 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1037838, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/8/2016', 'Weight': '47500', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1210, 'TruckCoGuid': 'b999d698-4e7e-10c0-9947-0b395262a5f3', 'PostingTruckCompanyId': 293208, 'PostGuid': 'c4575952-9c84-2ebc-b2bf-6a1ef17caa5d', 'PostId': 1269258350, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CHEHALIS', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 81, 'OriginLat': 46.66, 'OriginLon': -122.95, 'DestCity': 'RAPID CITY', 'DestState': 'SD', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.08, 'DestLon': -103.23, 'Length': '0', 'Phone': '801-981-4883', 'CompanyName': 'A-1 FREI', 'Entered': 'Sat, 06 Aug 2016 00:31:32 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1037838, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/9/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': '0ac1498b-70d7-015a-8afb-2bfe55267de5', 'PostingTruckCompanyId': 306778, 'PostGuid': '11a167d2-6979-fa44-ba48-7909ac4f0695', 'PostId': 1269716646, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.81, 'DestLon': -105.09, 'Length': '48', 'Phone': '800-971-3805', 'CompanyName': 'TRANSTEC', 'Entered': 'Sat, 06 Aug 2016 00:30:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1254157, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/9/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1313, 'TruckCoGuid': '0ac1498b-70d7-015a-8afb-2bfe55267de5', 'PostingTruckCompanyId': 306778, 'PostGuid': '41ca9b53-d2b4-5718-2bac-42d920a3fe2e', 'PostId': 1269716651, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'FLAGSTAFF', 'DestState': 'AZ', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.93, 'DestLon': -111.62, 'Length': '48', 'Phone': '800-971-3805', 'CompanyName': 'TRANSTEC', 'Entered': 'Sat, 06 Aug 2016 00:30:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1254157, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/9/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': '0ac1498b-70d7-015a-8afb-2bfe55267de5', 'PostingTruckCompanyId': 306778, 'PostGuid': '32c8d709-6377-f8a8-7e6f-015a0131be14', 'PostId': 1269716652, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.82, 'DestLon': -104.75, 'Length': '48', 'Phone': '800-971-3805', 'CompanyName': 'TRANSTEC', 'Entered': 'Sat, 06 Aug 2016 00:30:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1254157, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 503, 'PickUpDate': '8/8/2016', 'Weight': '46000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 182, 'TruckCoGuid': '2f693e6a-dfa3-319d-2af8-f46bf8bc8871', 'PostingTruckCompanyId': 319448, 'PostGuid': '525ab3e9-af7f-6d10-c37b-ca8fabab2695', 'PostId': 1266831496, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'AURORA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 22, 'OriginLat': 45.21, 'OriginLon': -122.82, 'DestCity': 'KENT', 'DestState': 'WA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 47.39, 'DestLon': -122.25, 'Length': '0', 'Phone': '920-358-5289', 'CompanyName': 'ARI LOGI', 'Entered': 'Fri, 05 Aug 2016 23:19:43 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1122251, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/8/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 268, 'TruckCoGuid': '4c2dc1a1-9281-be23-64b5-5307694fcb47', 'PostingTruckCompanyId': 106416, 'PostGuid': '455f2940-1ad2-0214-26ac-22a096e94441', 'PostId': 1269829531, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'CENTRAL POINT', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 42.37, 'DestLon': -122.91, 'Length': '0', 'Phone': '360-750-3662', 'CompanyName': 'GET IT D', 'Entered': 'Fri, 05 Aug 2016 23:18:14 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 179031, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': '22000', 'Payment': '575', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 243, 'TruckCoGuid': '6ed417fe-c0f9-c326-19a2-2aaa26d76507', 'PostingTruckCompanyId': 157665, 'PostGuid': 'a1f631be-dc1b-d0b1-c4ed-40bcb4aec247', 'PostId': 1269578558, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 3, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'BLAINE', 'DestState': 'WA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 48.99, 'DestLon': -122.74, 'Length': '22', 'Phone': '503-630-5500', 'CompanyName': 'MODERN B', 'Entered': 'Fri, 05 Aug 2016 23:05:53 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 674060, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': '15000', 'Payment': '1000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 815, 'TruckCoGuid': '6ed417fe-c0f9-c326-19a2-2aaa26d76507', 'PostingTruckCompanyId': 157665, 'PostGuid': 'c9c3a6db-953d-1836-408e-c92ee7c20526', 'PostId': 1269829261, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 3, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'SPRINGVILLE', 'DestState': 'UT', 'DestCtry': '', 'DestDist': 0, 'DestLat': 40.13, 'DestLon': -111.59, 'Length': '18', 'Phone': '503-630-5500', 'CompanyName': 'MODERN B', 'Entered': 'Fri, 05 Aug 2016 23:05:53 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 674060, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 503, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': '03a76ed9-45d8-226f-582d-bf07e41ea47a', 'PostingTruckCompanyId': 208846, 'PostGuid': '9cf1e0e2-92c9-8df1-20f9-ca90426f51b1', 'PostId': 1269728978, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.75, 'DestLon': -104.99, 'Length': '', 'Phone': '801-794-0239', 'CompanyName': 'GTO 2000', 'Entered': 'Fri, 05 Aug 2016 22:57:37 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 108775, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 503, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1313, 'TruckCoGuid': '03a76ed9-45d8-226f-582d-bf07e41ea47a', 'PostingTruckCompanyId': 208846, 'PostGuid': '5aa9d202-0aef-6841-eb9c-dde07f81c3d0', 'PostId': 1269730698, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'FLAGSTAFF', 'DestState': 'AZ', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.93, 'DestLon': -111.62, 'Length': '', 'Phone': '801-794-0239', 'CompanyName': 'GTO 2000', 'Entered': 'Fri, 05 Aug 2016 22:57:37 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 108775, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 503, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': '03a76ed9-45d8-226f-582d-bf07e41ea47a', 'PostingTruckCompanyId': 208846, 'PostGuid': '70df7109-6324-9c46-a41c-5cb9029a7784', 'PostId': 1269730699, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.82, 'DestLon': -104.75, 'Length': '', 'Phone': '801-794-0239', 'CompanyName': 'GTO 2000', 'Entered': 'Fri, 05 Aug 2016 22:57:37 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 108775, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '25000', 'Payment': '650', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 269, 'TruckCoGuid': '987d4cf5-39e5-5617-3597-d67c10ef6b09', 'PostingTruckCompanyId': 128729, 'PostGuid': 'f37c7743-2f3b-9f40-03f0-d32b1d68df82', 'PostId': 1269828127, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'BINGEN', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 59, 'OriginLat': 45.71, 'OriginLon': -121.48, 'DestCity': 'TACOMA', 'DestState': 'WA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 47.19, 'DestLon': -122.48, 'Length': '20', 'Phone': '800-422-1305', 'CompanyName': 'LANDSTAR', 'Entered': 'Fri, 05 Aug 2016 22:34:52 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 120117, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 524, 'TruckCoGuid': '5995c96d-b8d7-6dd5-14a3-ad0d469b206d', 'PostingTruckCompanyId': 190231, 'PostGuid': 'c03f3225-55fc-69ad-6392-f8170f2127ca', 'PostId': 1269096970, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'OLIVEHURST', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.09, 'DestLon': -121.55, 'Length': '0', 'Phone': '877-293-6326', 'CompanyName': '3 PEAKS ', 'Entered': 'Fri, 05 Aug 2016 22:34:14 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 787876, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1217, 'TruckCoGuid': '5995c96d-b8d7-6dd5-14a3-ad0d469b206d', 'PostingTruckCompanyId': 190231, 'PostGuid': 'a967e858-d9b4-6a3e-c3f8-03021491fdba', 'PostId': 1269345306, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'TIGARD', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 7, 'OriginLat': 45.44, 'OriginLon': -122.77, 'DestCity': 'RAPID CITY', 'DestState': 'SD', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.08, 'DestLon': -103.23, 'Length': '', 'Phone': '877-293-6326', 'CompanyName': '3 PEAKS ', 'Entered': 'Fri, 05 Aug 2016 22:34:14 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 787876, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 609, 'TruckCoGuid': '5995c96d-b8d7-6dd5-14a3-ad0d469b206d', 'PostingTruckCompanyId': 190231, 'PostGuid': '105940b0-950f-5007-c276-0ee00581f787', 'PostId': 1269609668, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': '', 'Phone': '877-293-6326', 'CompanyName': '3 PEAKS ', 'Entered': 'Fri, 05 Aug 2016 22:34:14 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 787876, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 646, 'TruckCoGuid': '5995c96d-b8d7-6dd5-14a3-ad0d469b206d', 'PostingTruckCompanyId': 190231, 'PostGuid': '23b34e15-8c44-6a29-1ea5-d648871b595e', 'PostId': 1266665517, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'NEWARK', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.51, 'DestLon': -122.03, 'Length': '', 'Phone': '877-293-6326', 'CompanyName': '3 PEAKS ', 'Entered': 'Fri, 05 Aug 2016 22:34:14 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 26370, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': '5995c96d-b8d7-6dd5-14a3-ad0d469b206d', 'PostingTruckCompanyId': 190231, 'PostGuid': '2731dce1-2cb6-21b2-f1aa-ea0bb96f29ad', 'PostId': 1269609677, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.75, 'DestLon': -104.99, 'Length': '', 'Phone': '877-293-6326', 'CompanyName': '3 PEAKS ', 'Entered': 'Fri, 05 Aug 2016 22:34:14 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 787876, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1210, 'TruckCoGuid': '5995c96d-b8d7-6dd5-14a3-ad0d469b206d', 'PostingTruckCompanyId': 190231, 'PostGuid': 'bef98548-3e7c-4503-236b-1bab499bc923', 'PostId': 1269345304, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CHEHALIS', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 81, 'OriginLat': 46.66, 'OriginLon': -122.95, 'DestCity': 'RAPID CITY', 'DestState': 'SD', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.08, 'DestLon': -103.23, 'Length': '0', 'Phone': '877-293-6326', 'CompanyName': '3 PEAKS ', 'Entered': 'Fri, 05 Aug 2016 22:34:14 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 787876, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1313, 'TruckCoGuid': '5995c96d-b8d7-6dd5-14a3-ad0d469b206d', 'PostingTruckCompanyId': 190231, 'PostGuid': '16f5886d-a7fa-897c-0b31-1152541e3d5f', 'PostId': 1268954547, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'FLAGSTAFF', 'DestState': 'AZ', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.93, 'DestLon': -111.62, 'Length': '0', 'Phone': '877-293-6326', 'CompanyName': '3 PEAKS ', 'Entered': 'Fri, 05 Aug 2016 22:34:14 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 349969, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': '5995c96d-b8d7-6dd5-14a3-ad0d469b206d', 'PostingTruckCompanyId': 190231, 'PostGuid': '7dae92ea-2263-5afc-0b94-1c827ef7d04b', 'PostId': 1269609676, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.82, 'DestLon': -104.75, 'Length': '', 'Phone': '877-293-6326', 'CompanyName': '3 PEAKS ', 'Entered': 'Fri, 05 Aug 2016 22:34:14 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 787876, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/10/2016', 'Weight': '48000', 'Payment': '859', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 669, 'TruckCoGuid': '70f708b6-cbc0-e70d-2996-6146a4e4f036', 'PostingTruckCompanyId': 133041, 'PostGuid': 'e6b53480-d9bd-1b94-5fba-c1095818a03e', 'PostId': 1267287149, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MIST', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 46, 'OriginLat': 45.99, 'OriginLon': -123.33, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': '0', 'Phone': '801-254-1000', 'CompanyName': 'V C LOGI', 'Entered': 'Fri, 05 Aug 2016 22:17:33 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15217, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/10/2016', 'Weight': '48000', 'Payment': '859', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 654, 'TruckCoGuid': '70f708b6-cbc0-e70d-2996-6146a4e4f036', 'PostingTruckCompanyId': 133041, 'PostGuid': '47cbaa0b-232c-c03a-802c-e1735035de4a', 'PostId': 1267287378, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'KALAMA', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 34, 'OriginLat': 45.99, 'OriginLon': -122.83, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': '0', 'Phone': '801-254-1000', 'CompanyName': 'V C LOGI', 'Entered': 'Fri, 05 Aug 2016 22:17:33 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15217, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 961, 'TruckCoGuid': '35df5623-4601-e489-3d73-01fb76d02470', 'PostingTruckCompanyId': 28044, 'PostGuid': '95d04ea7-526e-3a7b-c800-f15b70ad626a', 'PostId': 1269161851, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CORVALLIS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 72, 'OriginLat': 44.56, 'OriginLon': -123.25, 'DestCity': 'EPHRAIM', 'DestState': 'UT', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.34, 'DestLon': -111.57, 'Length': '', 'Phone': '800-727-9945', 'CompanyName': 'RAYCO TR', 'Entered': 'Fri, 05 Aug 2016 22:15:37 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 23150, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 961, 'TruckCoGuid': '35df5623-4601-e489-3d73-01fb76d02470', 'PostingTruckCompanyId': 28044, 'PostGuid': '08f9090f-4e0b-16b5-8d87-11a7ef9a22b7', 'PostId': 1269161850, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CORVALLIS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 72, 'OriginLat': 44.56, 'OriginLon': -123.25, 'DestCity': 'EPHRAIM', 'DestState': 'UT', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.34, 'DestLon': -111.57, 'Length': '', 'Phone': '800-727-9945', 'CompanyName': 'RAYCO TR', 'Entered': 'Fri, 05 Aug 2016 22:15:17 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 23150, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 449, 'TruckCoGuid': '60e50a5b-694d-3993-4d99-b68ff2dd4a06', 'PostingTruckCompanyId': 127237, 'PostGuid': '6dd8d11c-4723-a116-2285-f43bdeded37d', 'PostId': 1269522990, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LONGVIEW', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 45, 'OriginLat': 46.14, 'OriginLon': -122.9, 'DestCity': 'GRANGEVILLE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.91, 'DestLon': -116.11, 'Length': '', 'Phone': '888-344-6646', 'CompanyName': 'AMERICAN', 'Entered': 'Fri, 05 Aug 2016 22:14:12 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 297626, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 689, 'TruckCoGuid': '60e50a5b-694d-3993-4d99-b68ff2dd4a06', 'PostingTruckCompanyId': 127237, 'PostGuid': 'a39c8fa4-27e9-82b5-7f4e-7da79d58e729', 'PostId': 1269544205, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'HOOD RIVER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 57, 'OriginLat': 45.69, 'OriginLon': -121.52, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': '', 'Phone': '888-344-6646', 'CompanyName': 'AMERICAN', 'Entered': 'Fri, 05 Aug 2016 22:14:12 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 297626, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 653, 'TruckCoGuid': '60e50a5b-694d-3993-4d99-b68ff2dd4a06', 'PostingTruckCompanyId': 127237, 'PostGuid': 'b42a11fb-26c2-a6d1-0f3d-98b60e3e1e0b', 'PostId': 1269544204, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'HOOD RIVER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 57, 'OriginLat': 45.69, 'OriginLon': -121.52, 'DestCity': 'NEWARK', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.51, 'DestLon': -122.03, 'Length': '', 'Phone': '888-344-6646', 'CompanyName': 'AMERICAN', 'Entered': 'Fri, 05 Aug 2016 22:14:12 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 297626, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 260, 'TruckCoGuid': '60e50a5b-694d-3993-4d99-b68ff2dd4a06', 'PostingTruckCompanyId': 127237, 'PostGuid': '2f87ea1b-a78f-ae78-7b89-4cda3107ba0d', 'PostId': 1269462007, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'SHERIDAN', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 46, 'OriginLat': 45.08, 'OriginLon': -123.39, 'DestCity': 'MEDFORD', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 42.31, 'DestLon': -122.87, 'Length': '', 'Phone': '888-344-6646', 'CompanyName': 'AMERICAN', 'Entered': 'Fri, 05 Aug 2016 22:12:50 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 297626, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 578, 'TruckCoGuid': '60e50a5b-694d-3993-4d99-b68ff2dd4a06', 'PostingTruckCompanyId': 127237, 'PostGuid': '1c64fc41-1966-3916-0083-0cbf126d560b', 'PostId': 1269460113, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'ROSEVILLE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.74, 'DestLon': -121.29, 'Length': '', 'Phone': '888-344-6646', 'CompanyName': 'AMERICAN', 'Entered': 'Fri, 05 Aug 2016 22:12:00 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 297626, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 669, 'TruckCoGuid': '60e50a5b-694d-3993-4d99-b68ff2dd4a06', 'PostingTruckCompanyId': 127237, 'PostGuid': 'ec77c78e-0a37-bdaf-bb1e-02c5b5c832fe', 'PostId': 1269460112, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'ATWATER', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.33, 'DestLon': -120.59, 'Length': '', 'Phone': '888-344-6646', 'CompanyName': 'AMERICAN', 'Entered': 'Fri, 05 Aug 2016 22:12:00 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 297626, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1410, 'TruckCoGuid': '8f5b2daa-3f5b-435e-d37c-5ab39f5b2017', 'PostingTruckCompanyId': 265609, 'PostGuid': 'd6d782e0-28dc-13de-51af-df02c86e4f7a', 'PostId': 1269215360, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MOLALLA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 26, 'OriginLat': 45.14, 'OriginLon': -122.56, 'DestCity': 'ALBUQUERQUE', 'DestState': 'NM', 'DestCtry': '', 'DestDist': 0, 'DestLat': 35.07, 'DestLon': -106.64, 'Length': '', 'Phone': '775-673-1101', 'CompanyName': 'ADVANTAG', 'Entered': 'Fri, 05 Aug 2016 22:10:30 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 986477, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 669, 'TruckCoGuid': '8f5b2daa-3f5b-435e-d37c-5ab39f5b2017', 'PostingTruckCompanyId': 265609, 'PostGuid': 'a1ba16a4-7f4a-b66e-1bc6-7e588c3e3b86', 'PostId': 1268928264, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MIST', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 46, 'OriginLat': 45.99, 'OriginLon': -123.33, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': '', 'Phone': '775-673-1101', 'CompanyName': 'ADVANTAG', 'Entered': 'Fri, 05 Aug 2016 22:10:30 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 986477, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 48, 'TruckCoGuid': '8f5b2daa-3f5b-435e-d37c-5ab39f5b2017', 'PostingTruckCompanyId': 265609, 'PostGuid': 'e71983af-a7a1-0f2f-20fe-db8a5f0d6fd3', 'PostId': 1269338911, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LONGVIEW', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 45, 'OriginLat': 46.14, 'OriginLon': -122.9, 'DestCity': 'PORTLAND', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.51, 'DestLon': -122.67, 'Length': '', 'Phone': '775-673-1101', 'CompanyName': 'ADVANTAG', 'Entered': 'Fri, 05 Aug 2016 22:10:30 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 986477, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 654, 'TruckCoGuid': '8f5b2daa-3f5b-435e-d37c-5ab39f5b2017', 'PostingTruckCompanyId': 265609, 'PostGuid': '4e6e60b6-1896-25b4-6824-34c92b058c77', 'PostId': 1268934248, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'KALAMA', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 34, 'OriginLat': 45.99, 'OriginLon': -122.83, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': '', 'Phone': '775-673-1101', 'CompanyName': 'ADVANTAG', 'Entered': 'Fri, 05 Aug 2016 22:10:30 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 986477, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1313, 'TruckCoGuid': '8f5b2daa-3f5b-435e-d37c-5ab39f5b2017', 'PostingTruckCompanyId': 265609, 'PostGuid': '258ba0a9-8b1f-fb8d-3aa1-c4e8d23f6d98', 'PostId': 1269768382, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'FLAGSTAFF', 'DestState': 'AZ', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.93, 'DestLon': -111.62, 'Length': '', 'Phone': '775-673-1101', 'CompanyName': 'ADVANTAG', 'Entered': 'Fri, 05 Aug 2016 22:10:30 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 986477, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': '8f5b2daa-3f5b-435e-d37c-5ab39f5b2017', 'PostingTruckCompanyId': 265609, 'PostGuid': 'cd037d18-1125-fb60-9786-8efb458cf88c', 'PostId': 1269535385, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.82, 'DestLon': -104.75, 'Length': '', 'Phone': '775-673-1101', 'CompanyName': 'ADVANTAG', 'Entered': 'Fri, 05 Aug 2016 22:10:30 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 986477, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/11/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1300, 'TruckCoGuid': '47d8ffda-558f-a777-59ea-ce0ee658665b', 'PostingTruckCompanyId': 62011, 'PostGuid': '8cc4daf7-a67c-aff6-7687-976d9530038b', 'PostId': 1269826816, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'STAYTON', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 49, 'OriginLat': 44.8, 'OriginLon': -122.78, 'DestCity': 'PHOENIX', 'DestState': 'AZ', 'DestCtry': '', 'DestDist': 0, 'DestLat': 33.44, 'DestLon': -112.06, 'Length': '48', 'Phone': '623-386-4266', 'CompanyName': 'ARIZONA ', 'Entered': 'Fri, 05 Aug 2016 22:05:07 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 126210, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '20000', 'Payment': '650.0001', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 80, 'TruckCoGuid': 'cee193c9-7573-3090-3e6b-fd26fbd4f00b', 'PostingTruckCompanyId': 61158, 'PostGuid': '3405f6eb-42f5-83f7-100e-33266b0dca1f', 'PostId': 1269607149, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'NEWBERG', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 20, 'OriginLat': 45.3, 'OriginLon': -122.96, 'DestCity': 'TILLAMOOK', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.44, 'DestLon': -123.83, 'Length': '48', 'Phone': '406-880-1093', 'CompanyName': 'BIG SKY ', 'Entered': 'Fri, 05 Aug 2016 22:01:39 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1624124, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 435, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '8140a140-8399-36d0-e67d-fd24278396c5', 'PostId': 1269824520, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'VANCOUVER', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 8, 'OriginLat': 45.62, 'OriginLon': -122.66, 'DestCity': 'BOISE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.63, 'DestLon': -116.33, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 21:45:20 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 439, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'd2e1f15c-f987-5dc8-3201-dc62bf3b7638', 'PostId': 1269824521, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'BEAVERTON', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 6, 'OriginLat': 45.47, 'OriginLon': -122.79, 'DestCity': 'BOISE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.63, 'DestLon': -116.33, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 21:45:20 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 436, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '646213f0-0399-134a-564b-6d7d29aeef3b', 'PostId': 1269824522, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CAMAS', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 14, 'OriginLat': 45.58, 'OriginLon': -122.39, 'DestCity': 'BOISE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.63, 'DestLon': -116.33, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 21:45:20 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '47000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 467, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '5d84d5e7-1634-2d5b-5d47-9329fd5ec1b7', 'PostId': 1269824523, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MCMINNVILLE', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 36, 'OriginLat': 45.19, 'OriginLon': -123.26, 'DestCity': 'BOISE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.63, 'DestLon': -116.33, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 21:45:20 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '47000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 436, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '65e7364b-c141-80a1-9065-62985f54719d', 'PostId': 1269824524, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CAMAS', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 14, 'OriginLat': 45.58, 'OriginLon': -122.39, 'DestCity': 'BOISE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.63, 'DestLon': -116.33, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 21:45:20 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '47000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 439, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'd14f56bd-6205-9033-2159-9da0bbe60d5a', 'PostId': 1269824525, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'BEAVERTON', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 6, 'OriginLat': 45.47, 'OriginLon': -122.79, 'DestCity': 'BOISE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.63, 'DestLon': -116.33, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 21:45:20 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '47000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 435, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '2e14d5d3-1e20-5181-a289-b6007b635d7f', 'PostId': 1269824526, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'VANCOUVER', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 8, 'OriginLat': 45.62, 'OriginLon': -122.66, 'DestCity': 'BOISE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.63, 'DestLon': -116.33, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 21:45:20 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '47000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 462, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'edd83993-e988-89ba-8c06-e830ea9297fd', 'PostId': 1269824527, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WOODBURN', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 28, 'OriginLat': 45.13, 'OriginLon': -122.85, 'DestCity': 'BOISE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.63, 'DestLon': -116.33, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 21:45:20 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '47000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 455, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'c32fcc0d-6d7d-8b77-951d-b76233f018a9', 'PostId': 1269824528, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MOLALLA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 26, 'OriginLat': 45.14, 'OriginLon': -122.56, 'DestCity': 'BOISE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.63, 'DestLon': -116.33, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 21:45:20 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/10/2016', 'Weight': '47000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 436, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '1780a252-4503-7804-9083-16c7836e89a4', 'PostId': 1269824529, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CAMAS', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 14, 'OriginLat': 45.58, 'OriginLon': -122.39, 'DestCity': 'BOISE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.63, 'DestLon': -116.33, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 21:45:20 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/10/2016', 'Weight': '47000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 467, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '4f866f37-8606-0a68-5fd9-210c6297af72', 'PostId': 1269824530, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MCMINNVILLE', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 36, 'OriginLat': 45.19, 'OriginLon': -123.26, 'DestCity': 'BOISE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.63, 'DestLon': -116.33, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 21:45:20 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/10/2016', 'Weight': '47000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 435, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '0ea18ca5-02a2-36ca-a265-4e22d4a5d031', 'PostId': 1269824531, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'VANCOUVER', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 8, 'OriginLat': 45.62, 'OriginLon': -122.66, 'DestCity': 'BOISE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.63, 'DestLon': -116.33, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 21:45:20 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '12/31/1999', 'Weight': '46443', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 449, 'TruckCoGuid': 'df05f3fe-50fc-128a-501e-6387a8812498', 'PostingTruckCompanyId': 299519, 'PostGuid': 'bb7759b5-bcbc-d517-6ae9-668c8802bcbb', 'PostId': 1269823965, 'EquipmentType': 'FO', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LONGVIEW', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 45, 'OriginLat': 46.14, 'OriginLon': -122.9, 'DestCity': 'GRANGEVILLE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.91, 'DestLon': -116.11, 'Length': '60', 'Phone': '503-687-2789', 'CompanyName': 'OPENROAD', 'Entered': 'Fri, 05 Aug 2016 21:34:07 GMT', 'IsDaily': true, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1534378, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '47102', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 636, 'TruckCoGuid': '07af4696-352c-6a1e-789d-40fb20eb4b32', 'PostingTruckCompanyId': 341329, 'PostGuid': '86810f9f-8290-6531-9778-4f0b23fa5837', 'PostId': 1269716493, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'VANCOUVER', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 12, 'OriginLat': 45.66, 'OriginLon': -122.55, 'DestCity': 'STOCKTON', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.96, 'DestLon': -121.28, 'Length': '0', 'Phone': '858-342-6401', 'CompanyName': 'CONVOY I', 'Entered': 'Fri, 05 Aug 2016 21:31:12 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1739427, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '10000', 'Payment': '3000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 2254, 'TruckCoGuid': '2bbf359d-2c23-baf9-7f7c-7877bc5bd237', 'PostingTruckCompanyId': 322646, 'PostGuid': '291b1f25-831d-abe5-462e-a51d157b707b', 'PostId': 1269823106, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'SALEM', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 43, 'OriginLat': 44.94, 'OriginLon': -123, 'DestCity': 'MISHAWAKA', 'DestState': 'IN', 'DestCtry': '', 'DestDist': 0, 'DestLat': 41.65, 'DestLon': -86.15, 'Length': '0', 'Phone': '800-323-5441.', 'CompanyName': 'FREIGHTQ', 'Entered': 'Fri, 05 Aug 2016 21:26:33 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1516558, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '12000', 'Payment': '400', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 146, 'TruckCoGuid': '8b8353b4-3f29-65e6-ac06-4ac295b51c40', 'PostingTruckCompanyId': 255287, 'PostGuid': 'ccb0d720-c9c3-3bb9-ad39-d88e0145aaf8', 'PostId': 1269821864, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 3, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'PRINEVILLE', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.3, 'DestLon': -120.82, 'Length': '25', 'Phone': '503-786-8000', 'CompanyName': 'MULINO T', 'Entered': 'Fri, 05 Aug 2016 21:12:13 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 838852, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 457, 'TruckCoGuid': '84b4bc0b-319a-18b7-9f77-b8a7f74d5c07', 'PostingTruckCompanyId': 243780, 'PostGuid': 'c088eb99-e23e-6ed0-0109-975a4a8d3fa0', 'PostId': 1269767345, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'NAMPA', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.56, 'DestLon': -116.56, 'Length': '0', 'Phone': '509-319-0977', 'CompanyName': 'SYSTEM T', 'Entered': 'Fri, 05 Aug 2016 21:05:56 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 331376, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '45000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1610, 'TruckCoGuid': '7a9aeb48-460b-ad3b-0a25-318ec3dffd4a', 'PostingTruckCompanyId': 127715, 'PostGuid': '14d607e9-b9cd-001d-1477-7d7aa1cb975b', 'PostId': 1269740962, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LONGVIEW', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 45, 'OriginLat': 46.14, 'OriginLon': -122.9, 'DestCity': 'HAYS', 'DestState': 'KS', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.86, 'DestLon': -99.31, 'Length': ' ', 'Phone': '406-586-0648', 'CompanyName': 'BRIDGER ', 'Entered': 'Fri, 05 Aug 2016 21:03:59 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 21807, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 503, 'PickUpDate': '8/10/2016', 'Weight': '68000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1753, 'TruckCoGuid': '82100eec-f822-80b0-90f8-d7c46dbf2b2f', 'PostingTruckCompanyId': 306572, 'PostGuid': '9f0243f2-c3b4-8745-37e1-5895926b1731', 'PostId': 1269607727, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'WICHITA', 'DestState': 'KS', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.67, 'DestLon': -97.33, 'Length': '25', 'Phone': '619-781-7099', 'CompanyName': 'ROADRUNN', 'Entered': 'Fri, 05 Aug 2016 21:02:26 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 982119, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '750', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 371, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'c63b24d2-ca91-d5d3-be8f-90cc272c5f98', 'PostId': 1269820831, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PHILOMATH', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 75, 'OriginLat': 44.53, 'OriginLon': -123.35, 'DestCity': 'LEAVENWORTH', 'DestState': 'WA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 47.58, 'DestLon': -120.66, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 21:01:30 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '750', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 371, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '219188f8-4de0-c877-2f0a-aa82c1887feb', 'PostId': 1269820833, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PHILOMATH', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 75, 'OriginLat': 44.53, 'OriginLon': -123.35, 'DestCity': 'LEAVENWORTH', 'DestState': 'WA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 47.58, 'DestLon': -120.66, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 21:01:30 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/10/2016', 'Weight': '48000', 'Payment': '750', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 371, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '9540f774-feca-ca9b-b94c-018a588f75c9', 'PostId': 1269820836, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PHILOMATH', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 75, 'OriginLat': 44.53, 'OriginLon': -123.35, 'DestCity': 'LEAVENWORTH', 'DestState': 'WA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 47.58, 'DestLon': -120.66, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 21:01:30 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/11/2016', 'Weight': '48000', 'Payment': '750', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 371, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '52bd9237-886c-cfcb-cd92-3d0a08c1720a', 'PostId': 1269820840, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PHILOMATH', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 75, 'OriginLat': 44.53, 'OriginLon': -123.35, 'DestCity': 'LEAVENWORTH', 'DestState': 'WA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 47.58, 'DestLon': -120.66, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 21:01:30 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/12/2016', 'Weight': '48000', 'Payment': '750', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 371, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '2de32d9e-84cd-6204-b437-c7c354a2612e', 'PostId': 1269820843, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PHILOMATH', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 75, 'OriginLat': 44.53, 'OriginLon': -123.35, 'DestCity': 'LEAVENWORTH', 'DestState': 'WA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 47.58, 'DestLon': -120.66, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 21:01:30 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 799, 'TruckCoGuid': '1d55bc9b-b0c5-491f-8ea7-3235b204a2fc', 'PostingTruckCompanyId': 14861, 'PostGuid': '17f70d74-33d4-8cbb-b206-6ca064cd6ec5', 'PostId': 1269820699, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WARRENTON', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 74, 'OriginLat': 46.15, 'OriginLon': -123.91, 'DestCity': 'IDAHO FALLS', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.51, 'DestLon': -111.92, 'Length': '48', 'Phone': '800-799-9008', 'CompanyName': 'PACKARD ', 'Entered': 'Fri, 05 Aug 2016 21:01:05 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 18431, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/9/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 578, 'TruckCoGuid': 'fe32dd22-9ea8-a30b-83d2-98c08353ffec', 'PostingTruckCompanyId': 132913, 'PostGuid': '516098d4-88cd-0f0e-0113-6d98afb4f1fb', 'PostId': 1269198767, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'ROSEVILLE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.74, 'DestLon': -121.29, 'Length': '0', 'Phone': '208-454-1002', 'CompanyName': 'CANAM LO', 'Entered': 'Fri, 05 Aug 2016 20:59:08 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 810611, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 578, 'TruckCoGuid': 'fe32dd22-9ea8-a30b-83d2-98c08353ffec', 'PostingTruckCompanyId': 132913, 'PostGuid': '7943ca3c-3765-8c63-ef11-cca006692f95', 'PostId': 1269198766, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'ROSEVILLE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.74, 'DestLon': -121.29, 'Length': '0', 'Phone': '208-454-1002', 'CompanyName': 'CANAM LO', 'Entered': 'Fri, 05 Aug 2016 20:59:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 810611, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/9/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 524, 'TruckCoGuid': 'fe32dd22-9ea8-a30b-83d2-98c08353ffec', 'PostingTruckCompanyId': 132913, 'PostGuid': '857aebe5-0254-d2dd-611b-892ac16d1f26', 'PostId': 1269597186, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'OLIVEHURST', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.09, 'DestLon': -121.55, 'Length': '0', 'Phone': '208-454-1002', 'CompanyName': 'CANAM LO', 'Entered': 'Fri, 05 Aug 2016 20:58:55 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 810611, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 524, 'TruckCoGuid': 'fe32dd22-9ea8-a30b-83d2-98c08353ffec', 'PostingTruckCompanyId': 132913, 'PostGuid': 'a09d4097-6bb6-0748-5c4a-ba39b3a664a4', 'PostId': 1269597185, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'OLIVEHURST', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.09, 'DestLon': -121.55, 'Length': '0', 'Phone': '208-454-1002', 'CompanyName': 'CANAM LO', 'Entered': 'Fri, 05 Aug 2016 20:58:45 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 810611, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/9/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 579, 'TruckCoGuid': 'fe32dd22-9ea8-a30b-83d2-98c08353ffec', 'PostingTruckCompanyId': 132913, 'PostGuid': '2a01fa85-eadb-ced1-8435-465a9ef005b7', 'PostId': 1269596782, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'ELK GROVE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.39, 'DestLon': -121.37, 'Length': '0', 'Phone': '208-454-1002', 'CompanyName': 'CANAM LO', 'Entered': 'Fri, 05 Aug 2016 20:58:32 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 810611, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 579, 'TruckCoGuid': 'fe32dd22-9ea8-a30b-83d2-98c08353ffec', 'PostingTruckCompanyId': 132913, 'PostGuid': '22a91444-b453-7824-0574-c1533e747a9d', 'PostId': 1269596783, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'ELK GROVE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.39, 'DestLon': -121.37, 'Length': '0', 'Phone': '208-454-1002', 'CompanyName': 'CANAM LO', 'Entered': 'Fri, 05 Aug 2016 20:58:28 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 810611, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '46176', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 599, 'TruckCoGuid': '84b4bc0b-319a-18b7-9f77-b8a7f74d5c07', 'PostingTruckCompanyId': 243780, 'PostGuid': 'bea2cdaf-ad1d-f414-64f8-f1c3c55f0194', 'PostId': 1269767243, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'TWIN FALLS', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 42.56, 'DestLon': -114.46, 'Length': '0', 'Phone': '509-319-0977', 'CompanyName': 'SYSTEM T', 'Entered': 'Fri, 05 Aug 2016 20:58:25 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 331376, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '29000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 2731, 'TruckCoGuid': '292d4010-592d-6283-7a6c-45acba183901', 'PostingTruckCompanyId': 71462, 'PostGuid': 'ea2520ac-8e77-24b9-dcee-cc8815fc2dc3', 'PostId': 1269258345, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 3, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'SALEM', 'DestState': 'VA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.28, 'DestLon': -80.05, 'Length': '0', 'Phone': '636-583-6611', 'CompanyName': 'TRANSFRE', 'Entered': 'Fri, 05 Aug 2016 20:57:47 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 23462, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1448', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': '20a3708f-98ad-c947-fb46-8534d06b1d6c', 'PostingTruckCompanyId': 51256, 'PostGuid': '9b1e2055-b3ff-f08d-756c-a9602ef734a8', 'PostId': 1269819754, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.81, 'DestLon': -105.09, 'Length': '48', 'Phone': '866-271-2070', 'CompanyName': 'SHIPPING', 'Entered': 'Fri, 05 Aug 2016 20:55:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 65531, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1538', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1313, 'TruckCoGuid': '20a3708f-98ad-c947-fb46-8534d06b1d6c', 'PostingTruckCompanyId': 51256, 'PostGuid': 'b1a74de1-dcaf-f482-6043-356aa925ce9b', 'PostId': 1269819758, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'FLAGSTAFF', 'DestState': 'AZ', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.93, 'DestLon': -111.62, 'Length': '48', 'Phone': '866-271-2070', 'CompanyName': 'SHIPPING', 'Entered': 'Fri, 05 Aug 2016 20:55:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 65531, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1538', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': '20a3708f-98ad-c947-fb46-8534d06b1d6c', 'PostingTruckCompanyId': 51256, 'PostGuid': '771803b4-3b83-d434-63b9-f0e0be075b69', 'PostId': 1269819759, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.82, 'DestLon': -104.75, 'Length': '48', 'Phone': '866-271-2070', 'CompanyName': 'SHIPPING', 'Entered': 'Fri, 05 Aug 2016 20:55:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 65531, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '1538', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': '20a3708f-98ad-c947-fb46-8534d06b1d6c', 'PostingTruckCompanyId': 51256, 'PostGuid': '92c89c65-4b0a-ff5a-0c82-93c1cec6ae74', 'PostId': 1269819766, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.82, 'DestLon': -104.75, 'Length': '48', 'Phone': '866-271-2070', 'CompanyName': 'SHIPPING', 'Entered': 'Fri, 05 Aug 2016 20:55:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 65531, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '1538', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1313, 'TruckCoGuid': '20a3708f-98ad-c947-fb46-8534d06b1d6c', 'PostingTruckCompanyId': 51256, 'PostGuid': '69b9b1a7-5a4e-7dd9-3251-7f845b89ac7a', 'PostId': 1269819767, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'FLAGSTAFF', 'DestState': 'AZ', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.93, 'DestLon': -111.62, 'Length': '48', 'Phone': '866-271-2070', 'CompanyName': 'SHIPPING', 'Entered': 'Fri, 05 Aug 2016 20:55:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 65531, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '1448', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': '20a3708f-98ad-c947-fb46-8534d06b1d6c', 'PostingTruckCompanyId': 51256, 'PostGuid': 'ece87933-17e4-6775-7276-6eaefa3d2602', 'PostId': 1269819771, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.81, 'DestLon': -105.09, 'Length': '48', 'Phone': '866-271-2070', 'CompanyName': 'SHIPPING', 'Entered': 'Fri, 05 Aug 2016 20:55:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 65531, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 650, 'TruckCoGuid': '82ca1f9a-87a6-29fa-2a86-c3504d0cfa8f', 'PostingTruckCompanyId': 71143, 'PostGuid': '3a172806-8929-ca57-f88b-b17b4d5a9795', 'PostId': 1269819566, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'SUNNYVALE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.38, 'DestLon': -122.01, 'Length': '48', 'Phone': '217-935-6543', 'CompanyName': 'SELECT L', 'Entered': 'Fri, 05 Aug 2016 20:53:56 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 390, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 650, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '6cdac914-a056-5b18-491c-63bfed6e5f32', 'PostId': 1269818710, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 50, 'OriginLat': 45.06, 'OriginLon': -123.48, 'DestCity': 'SUNNYVALE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.38, 'DestLon': -122.01, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 20:46:55 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '1000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 650, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '2b2a5c1b-d21e-4b96-1581-79ef330a6eee', 'PostId': 1269818711, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 50, 'OriginLat': 45.06, 'OriginLon': -123.48, 'DestCity': 'SUNNYVALE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.38, 'DestLon': -122.01, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 20:46:55 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/10/2016', 'Weight': '48000', 'Payment': '1000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 650, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '0f964b46-37b0-551c-3fe3-3b5188ab2c26', 'PostId': 1269818712, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 50, 'OriginLat': 45.06, 'OriginLon': -123.48, 'DestCity': 'SUNNYVALE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.38, 'DestLon': -122.01, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 20:46:55 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/11/2016', 'Weight': '48000', 'Payment': '1000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 650, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '898e5180-28f5-bf14-fa86-470baa254d99', 'PostId': 1269818713, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 50, 'OriginLat': 45.06, 'OriginLon': -123.48, 'DestCity': 'SUNNYVALE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.38, 'DestLon': -122.01, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 20:46:55 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/12/2016', 'Weight': '48000', 'Payment': '1000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 650, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'c0246017-c046-551f-1ab1-73d7a7e39cb8', 'PostId': 1269818714, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 50, 'OriginLat': 45.06, 'OriginLon': -123.48, 'DestCity': 'SUNNYVALE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.38, 'DestLon': -122.01, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 20:46:55 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 272, 'TruckCoGuid': '5cac5f62-268a-6d61-d393-09838dde4a8a', 'PostingTruckCompanyId': 70681, 'PostGuid': '929cd94e-9cdd-1116-6593-e3ebea01a8a2', 'PostId': 1269818500, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'MEDFORD', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 42.31, 'DestLon': -122.87, 'Length': '', 'Phone': '800-452-5587', 'CompanyName': 'JANCO SA', 'Entered': 'Fri, 05 Aug 2016 20:46:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 224187, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 501, 'PickUpDate': '8/8/2016', 'Weight': '', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 650, 'TruckCoGuid': 'a03ff415-2ffa-891c-2e0b-2a41bdf4a062', 'PostingTruckCompanyId': 333989, 'PostGuid': '96ad5766-c968-8fa7-2a05-2d5a4a5eb0a1', 'PostId': 1269818333, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'SUNNYVALE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.38, 'DestLon': -122.01, 'Length': '', 'Phone': '806-577-4908', 'CompanyName': 'TRINITY ', 'Entered': 'Fri, 05 Aug 2016 20:44:57 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1737638, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1200', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 636, 'TruckCoGuid': '65bb090c-d012-4da3-cd86-563247ab7811', 'PostingTruckCompanyId': 339376, 'PostGuid': '017e2ca4-080f-7d96-e022-90a7a4a7ed6b', 'PostId': 1269817453, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'VANCOUVER', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 12, 'OriginLat': 45.66, 'OriginLon': -122.55, 'DestCity': 'STOCKTON', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.96, 'DestLon': -121.28, 'Length': '0', 'Phone': '360-609-0686', 'CompanyName': 'CONVOY I', 'Entered': 'Fri, 05 Aug 2016 20:38:34 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1711129, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '0', 'Payment': '1000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 402, 'TruckCoGuid': 'd0e718cf-4885-a155-c51a-11673a0ec28c', 'PostingTruckCompanyId': 233230, 'PostGuid': '33c124fb-040b-a4a5-91f8-49a4b10c049b', 'PostId': 1269817175, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'RATHDRUM', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 47.81, 'DestLon': -116.88, 'Length': '0', 'Phone': '503-510-5465', 'CompanyName': 'TRADEWIN', 'Entered': 'Fri, 05 Aug 2016 20:36:21 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 266291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 786, 'TruckCoGuid': '65e56d36-fdda-ee17-a2f1-e8402088cc2a', 'PostingTruckCompanyId': 192261, 'PostGuid': '5cd1caa0-1811-9102-b501-3454c99679af', 'PostId': 1269816565, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'SHERIDAN', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 46, 'OriginLat': 45.08, 'OriginLon': -123.39, 'DestCity': 'BELGRADE', 'DestState': 'MT', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.76, 'DestLon': -111.16, 'Length': '0', 'Phone': '541-981-2206', 'CompanyName': 'HELLS CA', 'Entered': 'Fri, 05 Aug 2016 20:34:28 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 771090, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48,000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1210, 'TruckCoGuid': '25663afd-b83d-c987-02d5-90fb06c5512f', 'PostingTruckCompanyId': 75295, 'PostGuid': '74e5838f-01b8-8463-f831-950343763f67', 'PostId': 1269815544, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CHEHALIS', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 81, 'OriginLat': 46.66, 'OriginLon': -122.95, 'DestCity': 'RAPID CITY', 'DestState': 'SD', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.08, 'DestLon': -103.23, 'Length': '48', 'Phone': '402-564-6375', 'CompanyName': 'TRANSPOR', 'Entered': 'Fri, 05 Aug 2016 20:29:57 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 9627, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48,000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 99, 'TruckCoGuid': '25663afd-b83d-c987-02d5-90fb06c5512f', 'PostingTruckCompanyId': 75295, 'PostGuid': '79bca8a0-38ec-fab8-30fa-171aaebe13c8', 'PostId': 1269815557, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'DALLESPORT', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 73, 'OriginLat': 45.6, 'OriginLon': -121.16, 'DestCity': 'ALOHA', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.48, 'DestLon': -122.85, 'Length': '48', 'Phone': '402-564-6375', 'CompanyName': 'TRANSPOR', 'Entered': 'Fri, 05 Aug 2016 20:29:57 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 9627, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48,000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1217, 'TruckCoGuid': '25663afd-b83d-c987-02d5-90fb06c5512f', 'PostingTruckCompanyId': 75295, 'PostGuid': '2f52882c-cd1c-06db-cfa8-a5c78facef8c', 'PostId': 1269815639, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'TIGARD', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 7, 'OriginLat': 45.44, 'OriginLon': -122.77, 'DestCity': 'RAPID CITY', 'DestState': 'SD', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.08, 'DestLon': -103.23, 'Length': '48', 'Phone': '402-564-6375', 'CompanyName': 'TRANSPOR', 'Entered': 'Fri, 05 Aug 2016 20:29:57 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 9627, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '29000', 'Payment': '1750', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 2731, 'TruckCoGuid': '4654f273-3361-8b5e-1f9e-5638d9d19120', 'PostingTruckCompanyId': 50794, 'PostGuid': 'bb057b94-ca6e-c746-bc15-1edfa3fe2e3f', 'PostId': 1269670961, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 3, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'SALEM', 'DestState': 'VA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.28, 'DestLon': -80.05, 'Length': '24', 'Phone': '316-682-1628', 'CompanyName': 'SUDBURY ', 'Entered': 'Fri, 05 Aug 2016 20:08:47 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 691401, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '45000', 'Payment': '400', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 55, 'TruckCoGuid': 'a3f30f83-fc89-f463-4d0f-6ffa77711836', 'PostingTruckCompanyId': 281532, 'PostGuid': '82de4a62-0b10-fdf5-b4be-2783ff593aae', 'PostId': 1269811041, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CENTRALIA', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 84, 'OriginLat': 46.71, 'OriginLon': -122.95, 'DestCity': 'TACOMA', 'DestState': 'WA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 47.19, 'DestLon': -122.48, 'Length': '48', 'Phone': '541-897-6386', 'CompanyName': 'RT LOGIS', 'Entered': 'Fri, 05 Aug 2016 20:08:25 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 937435, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1,500', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': '44ad844b-75cc-d175-03ab-386b0f7c9139', 'PostingTruckCompanyId': 221346, 'PostGuid': '24d1bd5b-0564-6341-c477-e254e122168c', 'PostId': 1269446072, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.75, 'DestLon': -104.99, 'Length': '', 'Phone': '936-202-8715', 'CompanyName': 'HAYNES L', 'Entered': 'Fri, 05 Aug 2016 20:03:49 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 211428, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1,600', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': '44ad844b-75cc-d175-03ab-386b0f7c9139', 'PostingTruckCompanyId': 221346, 'PostGuid': '3b55a1e9-6861-95ad-f5f6-ef8873b802d2', 'PostId': 1269446075, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.82, 'DestLon': -104.75, 'Length': '', 'Phone': '936-202-8715', 'CompanyName': 'HAYNES L', 'Entered': 'Fri, 05 Aug 2016 20:03:49 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 211428, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1,600', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1313, 'TruckCoGuid': '44ad844b-75cc-d175-03ab-386b0f7c9139', 'PostingTruckCompanyId': 221346, 'PostGuid': '7bab95cb-9316-b475-23b0-e4211c252821', 'PostId': 1269726420, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'FLAGSTAFF', 'DestState': 'AZ', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.93, 'DestLon': -111.62, 'Length': '', 'Phone': '936-202-8715', 'CompanyName': 'HAYNES L', 'Entered': 'Fri, 05 Aug 2016 20:03:49 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 211428, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '42500', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 623, 'TruckCoGuid': '1dd70f38-7550-8961-231a-9ae77a55b219', 'PostingTruckCompanyId': 340923, 'PostGuid': '644bf199-b445-7264-d856-6fa9f9d3e5bb', 'PostId': 1269808702, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'TUALATIN', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 10, 'OriginLat': 45.37, 'OriginLon': -122.75, 'DestCity': 'SAN FRANCISCO', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.77, 'DestLon': -122.41, 'Length': '48', 'Phone': '253-693-4228', 'CompanyName': 'BLUE TIG', 'Entered': 'Fri, 05 Aug 2016 19:58:58 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1753331, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '12/31/1999', 'Weight': '47000', 'Payment': '950', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 646, 'TruckCoGuid': '433cbfe5-065f-cc12-6192-ea79681909f7', 'PostingTruckCompanyId': 275494, 'PostGuid': 'ec499e1b-2cc1-4d90-01b6-ee9bcc1c1b72', 'PostId': 1269805311, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'NEWARK', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.51, 'DestLon': -122.03, 'Length': '0', 'Phone': '980-242-4450', 'CompanyName': 'PLS LOGI', 'Entered': 'Fri, 05 Aug 2016 19:46:40 GMT', 'IsDaily': true, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1698954, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '12/31/1999', 'Weight': '47000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 627, 'TruckCoGuid': '433cbfe5-065f-cc12-6192-ea79681909f7', 'PostingTruckCompanyId': 275494, 'PostGuid': '7830b96f-c281-500f-c8b8-c2e2ff1a74ce', 'PostId': 1269805068, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'PETALUMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.22, 'DestLon': -122.63, 'Length': '0', 'Phone': '980-242-4450', 'CompanyName': 'PLS LOGI', 'Entered': 'Fri, 05 Aug 2016 19:46:01 GMT', 'IsDaily': true, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1698954, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': ' ', 'Payment': '125', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 48, 'TruckCoGuid': '82a224f3-b422-f9f2-6567-e36caa856ca9', 'PostingTruckCompanyId': 277699, 'PostGuid': '75d251a1-64b7-70b9-9052-9eb3d77b7762', 'PostId': 1269803751, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LONGVIEW', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 45, 'OriginLat': 46.14, 'OriginLon': -122.9, 'DestCity': 'PORTLAND', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.51, 'DestLon': -122.67, 'Length': ' ', 'Phone': '931-358-4504', 'CompanyName': 'OHIO VAL', 'Entered': 'Fri, 05 Aug 2016 19:39:45 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 631343, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': '2a07a4b9-6282-3a15-a179-fae77c77de02', 'PostingTruckCompanyId': 276007, 'PostGuid': '671907ed-fb7f-3bd7-a2db-485d091a1b8d', 'PostId': 1269450579, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.82, 'DestLon': -104.75, 'Length': '', 'Phone': '575-420-8967', 'CompanyName': 'J H ROSE', 'Entered': 'Fri, 05 Aug 2016 19:37:57 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 611070, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': '2a07a4b9-6282-3a15-a179-fae77c77de02', 'PostingTruckCompanyId': 276007, 'PostGuid': '609a51a4-5497-fa8f-0444-052ce2de34fa', 'PostId': 1269450576, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.75, 'DestLon': -104.99, 'Length': '', 'Phone': '575-420-8967', 'CompanyName': 'J H ROSE', 'Entered': 'Fri, 05 Aug 2016 19:37:57 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 611070, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1210, 'TruckCoGuid': '2a07a4b9-6282-3a15-a179-fae77c77de02', 'PostingTruckCompanyId': 276007, 'PostGuid': 'b9ef4cd7-090f-15ba-6c8f-3a68616262f7', 'PostId': 1269347128, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CHEHALIS', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 81, 'OriginLat': 46.66, 'OriginLon': -122.95, 'DestCity': 'RAPID CITY', 'DestState': 'SD', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.08, 'DestLon': -103.23, 'Length': '0', 'Phone': '575-420-8967', 'CompanyName': 'J H ROSE', 'Entered': 'Fri, 05 Aug 2016 19:37:05 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 611070, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1217, 'TruckCoGuid': '2a07a4b9-6282-3a15-a179-fae77c77de02', 'PostingTruckCompanyId': 276007, 'PostGuid': 'e6b8c5f0-142d-5569-df94-83097c30ee3d', 'PostId': 1269172674, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'TIGARD', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 7, 'OriginLat': 45.44, 'OriginLon': -122.77, 'DestCity': 'RAPID CITY', 'DestState': 'SD', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.08, 'DestLon': -103.23, 'Length': '0', 'Phone': '575-420-8967', 'CompanyName': 'J H ROSE', 'Entered': 'Fri, 05 Aug 2016 19:37:05 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 611070, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 332, 'TruckCoGuid': '2a07a4b9-6282-3a15-a179-fae77c77de02', 'PostingTruckCompanyId': 276007, 'PostGuid': '2b34d33c-f23d-17ef-626b-4e3e2dc46a01', 'PostId': 1269569119, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'HOOD RIVER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 57, 'OriginLat': 45.69, 'OriginLon': -121.52, 'DestCity': 'PARMA', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.77, 'DestLon': -116.93, 'Length': '', 'Phone': '575-420-8967', 'CompanyName': 'J H ROSE', 'Entered': 'Fri, 05 Aug 2016 19:36:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 611070, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 737, 'TruckCoGuid': '2a07a4b9-6282-3a15-a179-fae77c77de02', 'PostingTruckCompanyId': 276007, 'PostGuid': 'a0ef0177-27aa-fc1b-46b9-457ff8041ce7', 'PostId': 1269569121, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MOLALLA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 26, 'OriginLat': 45.14, 'OriginLon': -122.56, 'DestCity': 'FRESNO', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 36.74, 'DestLon': -119.8, 'Length': '', 'Phone': '575-420-8967', 'CompanyName': 'J H ROSE', 'Entered': 'Fri, 05 Aug 2016 19:36:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 611070, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 646, 'TruckCoGuid': '2a07a4b9-6282-3a15-a179-fae77c77de02', 'PostingTruckCompanyId': 276007, 'PostGuid': '9c593fc2-bfd8-7681-312f-33d574647d2f', 'PostId': 1269569759, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'NEWARK', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.51, 'DestLon': -122.03, 'Length': '', 'Phone': '575-420-8967', 'CompanyName': 'J H ROSE', 'Entered': 'Fri, 05 Aug 2016 19:36:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 611070, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 769, 'TruckCoGuid': '2a07a4b9-6282-3a15-a179-fae77c77de02', 'PostingTruckCompanyId': 276007, 'PostGuid': 'dca78024-5c5d-d2ac-7bf0-95e7ffed3c62', 'PostId': 1269569761, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'SHERIDAN', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 46, 'OriginLat': 45.08, 'OriginLon': -123.39, 'DestCity': 'MALAD CITY', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 41.95, 'DestLon': -112.69, 'Length': '', 'Phone': '575-420-8967', 'CompanyName': 'J H ROSE', 'Entered': 'Fri, 05 Aug 2016 19:36:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 611070, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '0', 'Payment': '975', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 646, 'TruckCoGuid': '9511c9f0-1ae4-b2ae-74b7-f8e10007daa8', 'PostingTruckCompanyId': 267913, 'PostGuid': 'ef12229c-2a8b-3587-5528-2058c50c4c8a', 'PostId': 1268621262, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'NEWARK', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.51, 'DestLon': -122.03, 'Length': '0', 'Phone': '503-897-6175', 'CompanyName': 'US LOGIS', 'Entered': 'Fri, 05 Aug 2016 19:26:56 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 509117, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '0', 'Payment': '925', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 609, 'TruckCoGuid': '9511c9f0-1ae4-b2ae-74b7-f8e10007daa8', 'PostingTruckCompanyId': 267913, 'PostGuid': '324db929-4fca-6bd7-dfe5-088d8a4c4ce6', 'PostId': 1268621264, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': '0', 'Phone': '503-897-6175', 'CompanyName': 'US LOGIS', 'Entered': 'Fri, 05 Aug 2016 19:26:56 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 509117, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '', 'Payment': '830', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 669, 'TruckCoGuid': '9511c9f0-1ae4-b2ae-74b7-f8e10007daa8', 'PostingTruckCompanyId': 267913, 'PostGuid': '67681219-133a-bfa3-9081-f54c33863872', 'PostId': 1268627231, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MIST ', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 46, 'OriginLat': 45.99, 'OriginLon': -123.33, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': '', 'Phone': '503-897-6175', 'CompanyName': 'US LOGIS', 'Entered': 'Fri, 05 Aug 2016 19:26:56 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 509117, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '', 'Payment': '830', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 654, 'TruckCoGuid': '9511c9f0-1ae4-b2ae-74b7-f8e10007daa8', 'PostingTruckCompanyId': 267913, 'PostGuid': 'b859c3ea-2172-3dbd-f711-d6a2196dac89', 'PostId': 1268627235, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'KALAMA', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 34, 'OriginLat': 45.99, 'OriginLon': -122.83, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': '', 'Phone': '503-897-6175', 'CompanyName': 'US LOGIS', 'Entered': 'Fri, 05 Aug 2016 19:26:56 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 509117, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 103, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1313, 'TruckCoGuid': 'e4205088-1e0f-1639-593b-ac3b1437ca51', 'PostingTruckCompanyId': 1466, 'PostGuid': '6f5bc7bc-9c5b-9f84-418a-5baab3643dba', 'PostId': 1269800263, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'FLAGSTAFF', 'DestState': 'AZ', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.93, 'DestLon': -111.62, 'Length': ' ', 'Phone': '480-984-8800', 'CompanyName': 'HICKS-CO', 'Entered': 'Fri, 05 Aug 2016 19:26:07 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 579, 'TruckCoGuid': '82ca1f9a-87a6-29fa-2a86-c3504d0cfa8f', 'PostingTruckCompanyId': 71143, 'PostGuid': '67656145-e50d-2fcf-1ee8-7654d3424e7b', 'PostId': 1269799717, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'ELK GROVE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.39, 'DestLon': -121.37, 'Length': '48', 'Phone': '217-935-6543', 'CompanyName': 'SELECT L', 'Entered': 'Fri, 05 Aug 2016 19:23:55 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 390, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 578, 'TruckCoGuid': '82ca1f9a-87a6-29fa-2a86-c3504d0cfa8f', 'PostingTruckCompanyId': 71143, 'PostGuid': '7e40103b-ca78-7402-1160-3c551f1d54a1', 'PostId': 1269799729, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'ROSEVILLE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.74, 'DestLon': -121.29, 'Length': '48', 'Phone': '217-935-6543', 'CompanyName': 'SELECT L', 'Entered': 'Fri, 05 Aug 2016 19:23:55 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 390, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 524, 'TruckCoGuid': '82ca1f9a-87a6-29fa-2a86-c3504d0cfa8f', 'PostingTruckCompanyId': 71143, 'PostGuid': '7d28adbb-c0c7-1c0a-7b1a-ef9bd5ead3b3', 'PostId': 1269799731, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'OLIVEHURST', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.09, 'DestLon': -121.55, 'Length': '48', 'Phone': '217-935-6543', 'CompanyName': 'SELECT L', 'Entered': 'Fri, 05 Aug 2016 19:23:55 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 390, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '950', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 625, 'TruckCoGuid': '3eef1bd1-6fda-cf22-f440-1557cd994286', 'PostingTruckCompanyId': 21703, 'PostGuid': '6fc5096e-7bad-4ef4-f9da-582ca3c16b60', 'PostId': 1269705153, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'SPARKS', 'DestState': 'NV', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.57, 'DestLon': -119.7, 'Length': '48', 'Phone': '866-205-7710', 'CompanyName': 'AMERICAN', 'Entered': 'Fri, 05 Aug 2016 19:15:45 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 21502, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '200', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 48, 'TruckCoGuid': '3eef1bd1-6fda-cf22-f440-1557cd994286', 'PostingTruckCompanyId': 21703, 'PostGuid': 'ef51ff46-5477-b9c4-6d0e-fc6a31792e0a', 'PostId': 1269704471, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LONGVIEW', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 45, 'OriginLat': 46.14, 'OriginLon': -122.9, 'DestCity': 'PORTLAND', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.51, 'DestLon': -122.67, 'Length': '48', 'Phone': '866-205-7710', 'CompanyName': 'AMERICAN', 'Entered': 'Fri, 05 Aug 2016 19:15:45 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 21502, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '0', 'Payment': '550', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 166, 'TruckCoGuid': 'eca7550a-c272-164e-f01f-07525ace2399', 'PostingTruckCompanyId': 51687, 'PostGuid': '4f15fa2f-e399-45d4-ee70-7bdf97dfa671', 'PostId': 1269797174, 'EquipmentType': 'CONG', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'RENTON', 'DestState': 'WA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 47.47, 'DestLon': -122.19, 'Length': '53', 'Phone': '800-726-8892', 'CompanyName': 'KNIGHT T', 'Entered': 'Fri, 05 Aug 2016 19:15:20 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 730206, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '150', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 48, 'TruckCoGuid': 'f1829a97-9ace-d8ad-0340-ebf44e7b8d88', 'PostingTruckCompanyId': 59769, 'PostGuid': '4f2b4814-aaf0-6459-a004-80df101c8915', 'PostId': 1269791744, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LONGVIEW', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 45, 'OriginLat': 46.14, 'OriginLon': -122.9, 'DestCity': 'PORTLAND', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.51, 'DestLon': -122.67, 'Length': '48', 'Phone': '319-726-3791', 'CompanyName': 'BIERI BR', 'Entered': 'Fri, 05 Aug 2016 18:54:22 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 19445, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '875', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 625, 'TruckCoGuid': 'f1829a97-9ace-d8ad-0340-ebf44e7b8d88', 'PostingTruckCompanyId': 59769, 'PostGuid': 'f30ab91b-201a-46ea-3a81-d537d4e2f793', 'PostId': 1269791753, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'SPARKS', 'DestState': 'NV', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.57, 'DestLon': -119.7, 'Length': '48', 'Phone': '319-726-3791', 'CompanyName': 'BIERI BR', 'Entered': 'Fri, 05 Aug 2016 18:54:22 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 19445, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '150', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 48, 'TruckCoGuid': 'f1829a97-9ace-d8ad-0340-ebf44e7b8d88', 'PostingTruckCompanyId': 59769, 'PostGuid': 'a3bf9678-9fc9-0b3e-d87e-ed086eee72ab', 'PostId': 1269791755, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LONGVIEW', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 45, 'OriginLat': 46.14, 'OriginLon': -122.9, 'DestCity': 'PORTLAND', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.51, 'DestLon': -122.67, 'Length': '48', 'Phone': '319-726-3791', 'CompanyName': 'BIERI BR', 'Entered': 'Fri, 05 Aug 2016 18:54:22 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 19445, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': ' ', 'Payment': '850', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 625, 'TruckCoGuid': '82a224f3-b422-f9f2-6567-e36caa856ca9', 'PostingTruckCompanyId': 277699, 'PostGuid': '2729cafe-a5ba-8b2c-57f7-58ae207ff3e3', 'PostId': 1269790786, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'SPARKS', 'DestState': 'NV', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.57, 'DestLon': -119.7, 'Length': ' ', 'Phone': '931-358-4504', 'CompanyName': 'OHIO VAL', 'Entered': 'Fri, 05 Aug 2016 18:50:37 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 631343, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '480000', 'Payment': '2,250', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1726, 'TruckCoGuid': '6160564e-42f4-226e-071d-a9ff54fa2dfa', 'PostingTruckCompanyId': 264621, 'PostGuid': '03073c0d-f3d9-1a3b-ea70-6fae8ba79ba8', 'PostId': 1269648601, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CULVER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 99, 'OriginLat': 44.51, 'OriginLon': -121.21, 'DestCity': 'BROWNTON', 'DestState': 'MN', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.72, 'DestLon': -94.35, 'Length': '', 'Phone': '812-282-2855', 'CompanyName': 'MEADOW L', 'Entered': 'Fri, 05 Aug 2016 18:49:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 576063, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1200', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 615, 'TruckCoGuid': '5bf59c00-0807-799c-c3f9-0796773068ea', 'PostingTruckCompanyId': 208977, 'PostGuid': '1b3ae053-c7d6-cd39-55b6-7597177814a8', 'PostId': 1269310682, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'SHERIDAN', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 46, 'OriginLat': 45.08, 'OriginLon': -123.39, 'DestCity': 'STOCKTON', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.96, 'DestLon': -121.28, 'Length': '0', 'Phone': '503-224-8694', 'CompanyName': 'MT HOOD ', 'Entered': 'Fri, 05 Aug 2016 18:18:59 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 679203, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 799, 'TruckCoGuid': 'f659c10f-7666-4898-5bc2-f47fa59344a1', 'PostingTruckCompanyId': 74335, 'PostGuid': '72c05e92-958a-f258-3801-42c4f0752add', 'PostId': 1269781433, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WARRENTON', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 74, 'OriginLat': 46.15, 'OriginLon': -123.91, 'DestCity': 'IDAHO FALLS', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.51, 'DestLon': -111.92, 'Length': '48', 'Phone': '888-290-1593', 'CompanyName': 'M MILLER', 'Entered': 'Fri, 05 Aug 2016 18:15:31 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 5428, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 799, 'TruckCoGuid': 'f659c10f-7666-4898-5bc2-f47fa59344a1', 'PostingTruckCompanyId': 74335, 'PostGuid': '25d0d1e6-dcb3-7ea6-8e4e-17df762bbdf6', 'PostId': 1269781451, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WARRENTON', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 74, 'OriginLat': 46.15, 'OriginLon': -123.91, 'DestCity': 'IDAHO FALLS', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.51, 'DestLon': -111.92, 'Length': '48', 'Phone': '888-290-1593', 'CompanyName': 'M MILLER', 'Entered': 'Fri, 05 Aug 2016 18:15:31 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 5428, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '1200', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 615, 'TruckCoGuid': '5bf59c00-0807-799c-c3f9-0796773068ea', 'PostingTruckCompanyId': 208977, 'PostGuid': '62e1ea2e-d18a-dfda-8601-7622bc689b33', 'PostId': 1269310718, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'SHERIDAN', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 46, 'OriginLat': 45.08, 'OriginLon': -123.39, 'DestCity': 'STOCKTON', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.96, 'DestLon': -121.28, 'Length': '0', 'Phone': '503-224-8694', 'CompanyName': 'MT HOOD ', 'Entered': 'Fri, 05 Aug 2016 18:13:36 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 679203, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/10/2016', 'Weight': '48000', 'Payment': '1200', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 615, 'TruckCoGuid': '5bf59c00-0807-799c-c3f9-0796773068ea', 'PostingTruckCompanyId': 208977, 'PostGuid': '0bd31641-0c56-1170-3f38-463ccc13236d', 'PostId': 1269311107, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'SHERIDAN', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 46, 'OriginLat': 45.08, 'OriginLon': -123.39, 'DestCity': 'STOCKTON', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.96, 'DestLon': -121.28, 'Length': '0', 'Phone': '503-224-8694', 'CompanyName': 'MT HOOD ', 'Entered': 'Fri, 05 Aug 2016 18:12:13 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 679203, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '950', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 659, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '3bbd9886-03a8-cd7d-f719-c2c69830fc31', 'PostId': 1269779275, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'SAN JOSE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.32, 'DestLon': -121.89, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 18:08:31 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '950', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 659, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '9d33eebb-8094-9351-46e0-267da83d5af6', 'PostId': 1269779276, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'SAN JOSE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.32, 'DestLon': -121.89, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 18:08:31 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/10/2016', 'Weight': '48000', 'Payment': '950', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 659, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '33645312-57c0-270e-8e40-d07f94de7554', 'PostId': 1269779277, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'SAN JOSE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.32, 'DestLon': -121.89, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 18:08:31 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/11/2016', 'Weight': '48000', 'Payment': '950', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 659, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '925922a2-3d9e-d9b1-bf7a-e979a70afa9e', 'PostId': 1269779278, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'SAN JOSE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.32, 'DestLon': -121.89, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 18:08:31 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/12/2016', 'Weight': '48000', 'Payment': '950', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 659, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'accc7214-dac9-18b6-ed15-688425abbc99', 'PostId': 1269779279, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'SAN JOSE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.32, 'DestLon': -121.89, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 18:08:31 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 627, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '7e015bd1-4d4f-c22c-68fa-b65169f93f90', 'PostId': 1269777710, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'PETALUMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.22, 'DestLon': -122.63, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 18:01:08 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '950', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 646, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'eb9bb23b-fa57-5caa-8530-747e436c6616', 'PostId': 1269777711, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'NEWARK', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.51, 'DestLon': -122.03, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 18:01:08 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '950', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 646, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'd6b1308d-e208-be97-5bf1-116e6ba5c237', 'PostId': 1269777713, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'NEWARK', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.51, 'DestLon': -122.03, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 18:01:08 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 627, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '1e62eaff-1e90-ad39-315a-c5333feee8e0', 'PostId': 1269777714, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'PETALUMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.22, 'DestLon': -122.63, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 18:01:08 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/10/2016', 'Weight': '48000', 'Payment': '950', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 646, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '62058e0d-ca7a-1615-0c45-137e6fccc411', 'PostId': 1269777716, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'NEWARK', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.51, 'DestLon': -122.03, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 18:01:08 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/10/2016', 'Weight': '48000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 627, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '3d220c05-47de-4b67-881f-75077d23c25f', 'PostId': 1269777717, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'PETALUMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.22, 'DestLon': -122.63, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 18:01:08 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/11/2016', 'Weight': '48000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 627, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '61a46b12-1cda-04d8-adbe-a55366937330', 'PostId': 1269777718, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'PETALUMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.22, 'DestLon': -122.63, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 18:01:08 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/11/2016', 'Weight': '48000', 'Payment': '950', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 646, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '45f3249e-ce3b-424a-4d41-aedbdcf13d00', 'PostId': 1269777720, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'NEWARK', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.51, 'DestLon': -122.03, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 18:01:08 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/12/2016', 'Weight': '48000', 'Payment': '950', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 646, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '4333e25b-ba88-0d36-7bf8-2c234216bf89', 'PostId': 1269777721, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'NEWARK', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.51, 'DestLon': -122.03, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 18:01:08 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/12/2016', 'Weight': '48000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 627, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '2c47feb2-2d71-131f-3b40-2caa01325a7d', 'PostId': 1269777722, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'PETALUMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.22, 'DestLon': -122.63, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 18:01:08 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 103, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1675, 'TruckCoGuid': 'e4205088-1e0f-1639-593b-ac3b1437ca51', 'PostingTruckCompanyId': 1466, 'PostGuid': '05b0186f-f111-1271-4c0a-b780fbbd1d99', 'PostId': 1268205763, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MOLALLA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 26, 'OriginLat': 45.14, 'OriginLon': -122.56, 'DestCity': 'EL PASO', 'DestState': 'TX', 'DestCtry': '', 'DestDist': 0, 'DestLat': 31.75, 'DestLon': -106.47, 'Length': ' ', 'Phone': '480-984-8800', 'CompanyName': 'HICKS-CO', 'Entered': 'Fri, 05 Aug 2016 17:56:20 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 103, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 654, 'TruckCoGuid': 'e4205088-1e0f-1639-593b-ac3b1437ca51', 'PostingTruckCompanyId': 1466, 'PostGuid': 'c0594264-6716-e561-0a2d-934c2cf0c222', 'PostId': 1268802227, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'KALAMA', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 34, 'OriginLat': 45.99, 'OriginLon': -122.83, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': ' ', 'Phone': '480-984-8800', 'CompanyName': 'HICKS-CO', 'Entered': 'Fri, 05 Aug 2016 17:56:20 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 103, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1410, 'TruckCoGuid': 'e4205088-1e0f-1639-593b-ac3b1437ca51', 'PostingTruckCompanyId': 1466, 'PostGuid': 'cb256f07-af21-e6de-bd83-723f7c854922', 'PostId': 1268954988, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MOLALLA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 26, 'OriginLat': 45.14, 'OriginLon': -122.56, 'DestCity': 'ALBUQUERQUE', 'DestState': 'NM', 'DestCtry': '', 'DestDist': 0, 'DestLat': 35.07, 'DestLon': -106.64, 'Length': ' ', 'Phone': '480-984-8800', 'CompanyName': 'HICKS-CO', 'Entered': 'Fri, 05 Aug 2016 17:56:20 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 103, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 669, 'TruckCoGuid': 'e4205088-1e0f-1639-593b-ac3b1437ca51', 'PostingTruckCompanyId': 1466, 'PostGuid': 'f7ae261a-5794-47fd-cc11-2119abb85714', 'PostId': 1269516801, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MIST', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 46, 'OriginLat': 45.99, 'OriginLon': -123.33, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': ' ', 'Phone': '480-984-8800', 'CompanyName': 'HICKS-CO', 'Entered': 'Fri, 05 Aug 2016 17:56:20 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 103, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1217, 'TruckCoGuid': 'e4205088-1e0f-1639-593b-ac3b1437ca51', 'PostingTruckCompanyId': 1466, 'PostGuid': '36c980a4-4a10-b6f8-4979-79905870ab2e', 'PostId': 1269455415, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'TIGARD', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 7, 'OriginLat': 45.44, 'OriginLon': -122.77, 'DestCity': 'RAPID CITY', 'DestState': 'SD', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.08, 'DestLon': -103.23, 'Length': ' ', 'Phone': '480-984-8800', 'CompanyName': 'HICKS-CO', 'Entered': 'Fri, 05 Aug 2016 17:56:20 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 103, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1210, 'TruckCoGuid': 'e4205088-1e0f-1639-593b-ac3b1437ca51', 'PostingTruckCompanyId': 1466, 'PostGuid': '2d75c68c-6c23-cf2f-88f0-6154d65c737e', 'PostId': 1269455999, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CHEHALIS', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 81, 'OriginLat': 46.66, 'OriginLon': -122.95, 'DestCity': 'RAPID CITY', 'DestState': 'SD', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.08, 'DestLon': -103.23, 'Length': ' ', 'Phone': '480-984-8800', 'CompanyName': 'HICKS-CO', 'Entered': 'Fri, 05 Aug 2016 17:56:20 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 103, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': 'e4205088-1e0f-1639-593b-ac3b1437ca51', 'PostingTruckCompanyId': 1466, 'PostGuid': 'df61b49c-7ed3-4055-e647-cc42ff4e9488', 'PostId': 1269467039, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.82, 'DestLon': -104.75, 'Length': ' ', 'Phone': '480-984-8800', 'CompanyName': 'HICKS-CO', 'Entered': 'Fri, 05 Aug 2016 17:56:20 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 103, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1246, 'TruckCoGuid': 'e4205088-1e0f-1639-593b-ac3b1437ca51', 'PostingTruckCompanyId': 1466, 'PostGuid': 'c29ddfb7-f8ee-3f4d-ff70-29db2ca50a24', 'PostId': 1269596793, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MCMINNVILLE', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 36, 'OriginLat': 45.19, 'OriginLon': -123.26, 'DestCity': 'RAPID CITY', 'DestState': 'SD', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.08, 'DestLon': -103.23, 'Length': ' ', 'Phone': '480-984-8800', 'CompanyName': 'HICKS-CO', 'Entered': 'Fri, 05 Aug 2016 17:56:20 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15291, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/10/2016', 'Weight': '9900', 'Payment': '5000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 3112, 'TruckCoGuid': 'afb8cbb4-72c9-22be-d023-ec043b5a83c1', 'PostingTruckCompanyId': 284658, 'PostGuid': '1c429828-6647-ec63-e590-5d3cd2a645d7', 'PostId': 1269754416, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'VANCOUVER', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 12, 'OriginLat': 45.66, 'OriginLon': -122.55, 'DestCity': 'EVERETT', 'DestState': 'MA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 42.39, 'DestLon': -71.05, 'Length': '53', 'Phone': '360-798-9021', 'CompanyName': 'A-1 FREI', 'Entered': 'Fri, 05 Aug 2016 17:22:56 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 717164, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/12/2016', 'Weight': '9900', 'Payment': '5000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 3112, 'TruckCoGuid': 'afb8cbb4-72c9-22be-d023-ec043b5a83c1', 'PostingTruckCompanyId': 284658, 'PostGuid': '9f0ca173-9d37-0387-d7bf-04ff15b829a3', 'PostId': 1269754415, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'VANCOUVER', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 12, 'OriginLat': 45.66, 'OriginLon': -122.55, 'DestCity': 'EVERETT', 'DestState': 'MA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 42.39, 'DestLon': -71.05, 'Length': '53', 'Phone': '360-798-9021', 'CompanyName': 'A-1 FREI', 'Entered': 'Fri, 05 Aug 2016 17:22:40 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 717164, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 411, 'TruckCoGuid': 'd391ea5e-a20d-9f2c-1eef-5da9775928c7', 'PostingTruckCompanyId': 42404, 'PostGuid': 'bbbe8f00-adac-f7bc-2012-285ac89dbecf', 'PostId': 1269705356, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'VANCOUVER', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 12, 'OriginLat': 45.66, 'OriginLon': -122.55, 'DestCity': 'GRANGEVILLE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.91, 'DestLon': -116.11, 'Length': '53', 'Phone': '800-580-3101', 'CompanyName': 'TOTAL QU', 'Entered': 'Fri, 05 Aug 2016 17:00:13 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 197, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 449, 'TruckCoGuid': 'd391ea5e-a20d-9f2c-1eef-5da9775928c7', 'PostingTruckCompanyId': 42404, 'PostGuid': 'ffd287ba-f309-8aec-cb58-f5b0e7d743a3', 'PostId': 1269706071, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LONGVIEW', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 45, 'OriginLat': 46.14, 'OriginLon': -122.9, 'DestCity': 'GRANGEVILLE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.91, 'DestLon': -116.11, 'Length': '53', 'Phone': '800-580-3101', 'CompanyName': 'TOTAL QU', 'Entered': 'Fri, 05 Aug 2016 17:00:13 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 197, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 408, 'TruckCoGuid': 'd391ea5e-a20d-9f2c-1eef-5da9775928c7', 'PostingTruckCompanyId': 42404, 'PostGuid': '3fc17936-bc2c-5646-0101-716c83e7d235', 'PostId': 1269706116, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'GRANGEVILLE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.91, 'DestLon': -116.11, 'Length': '53', 'Phone': '800-580-3101', 'CompanyName': 'TOTAL QU', 'Entered': 'Fri, 05 Aug 2016 17:00:13 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 197, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '251', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 49, 'TruckCoGuid': 'a07a8261-12f2-e7e6-2ec6-9fdd7ebf1cce', 'PostingTruckCompanyId': 338669, 'PostGuid': 'bd4f9a31-1b9e-f761-6a9f-cfa9d8b0395b', 'PostId': 1269744016, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'SALEM', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.94, 'DestLon': -123, 'Length': '0', 'Phone': '316-440-4243', 'CompanyName': 'KING OF ', 'Entered': 'Fri, 05 Aug 2016 16:54:32 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1692192, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '875', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 625, 'TruckCoGuid': 'f1829a97-9ace-d8ad-0340-ebf44e7b8d88', 'PostingTruckCompanyId': 59769, 'PostGuid': 'f45d5922-205e-f06d-012f-2103c9e19d65', 'PostId': 1269757603, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'SPARKS', 'DestState': 'NV', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.57, 'DestLon': -119.7, 'Length': '48', 'Phone': '319-726-3791', 'CompanyName': 'BIERI BR', 'Entered': 'Fri, 05 Aug 2016 16:51:15 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 19445, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 602, 'TruckCoGuid': '32801b06-2581-93c2-0bd0-8c883ef59c80', 'PostingTruckCompanyId': 74104, 'PostGuid': '9478f15f-6fa4-1ed6-f53f-ca55ea7a7c85', 'PostId': 1269606738, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'FOLSOM', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.66, 'DestLon': -121.16, 'Length': '0', 'Phone': '800-888-0542', 'CompanyName': 'CENTRAL ', 'Entered': 'Fri, 05 Aug 2016 16:38:29 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 100898, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': ' ', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 625, 'TruckCoGuid': 'b712d289-1779-1412-dd68-892e42a233e6', 'PostingTruckCompanyId': 315639, 'PostGuid': 'e1f1ce22-8a41-a27f-274a-ec9d61e8c601', 'PostId': 1269737831, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'SPARKS', 'DestState': 'NV', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.53, 'DestLon': -119.74, 'Length': ' ', 'Phone': '215-309-7640', 'CompanyName': 'PLS LOGI', 'Entered': 'Fri, 05 Aug 2016 15:47:43 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1138541, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/9/2016', 'Weight': '7100', 'Payment': '2500', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1802, 'TruckCoGuid': '18f2e0aa-28b0-6bee-4a23-317b8f398306', 'PostingTruckCompanyId': 789, 'PostGuid': '613df6f7-8f95-12ac-bb0a-556f4ed12b94', 'PostId': 1269641354, 'EquipmentType': 'CONG', 'EquipmentId': 0, 'LoadSize': 3, 'OriginCity': 'LEBANON', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 62, 'OriginLat': 44.62, 'OriginLon': -122.88, 'DestCity': 'CHAMPLIN', 'DestState': 'MN', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.17, 'DestLon': -93.39, 'Length': '34', 'Phone': '763-972-6116', 'CompanyName': 'GW TRANS', 'Entered': 'Fri, 05 Aug 2016 15:36:38 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 60488, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '800', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1082, 'TruckCoGuid': '96675bda-6a05-5624-287d-97aa3f27b901', 'PostingTruckCompanyId': 272042, 'PostGuid': 'bdaa1aa4-d56d-714e-81d3-9115c1c176d9', 'PostId': 1269731417, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'SAN DIEGO', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 32.74, 'DestLon': -117.1, 'Length': '48', 'Phone': '517-629-2386', 'CompanyName': 'TREK TRA', 'Entered': 'Fri, 05 Aug 2016 15:30:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 563667, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1600', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1313, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '9ddbeaec-f5f5-513e-2116-8b9659f5bfd4', 'PostId': 1269729855, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'FLAGSTAFF', 'DestState': 'AZ', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.93, 'DestLon': -111.62, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 15:25:32 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '1600', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1313, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '4279eb36-ae37-647c-f762-c11f899540da', 'PostId': 1269729859, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'FLAGSTAFF', 'DestState': 'AZ', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.93, 'DestLon': -111.62, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 15:25:32 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/10/2016', 'Weight': '48000', 'Payment': '1600', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1313, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'f703e413-c30d-1a79-6d75-186affee8a1b', 'PostId': 1269729863, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'FLAGSTAFF', 'DestState': 'AZ', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.93, 'DestLon': -111.62, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 15:25:32 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/11/2016', 'Weight': '48000', 'Payment': '1600', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1313, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '4be6d76c-2f0d-91b9-7cee-77f55a13c0c3', 'PostId': 1269729867, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'FLAGSTAFF', 'DestState': 'AZ', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.93, 'DestLon': -111.62, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 15:25:32 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/12/2016', 'Weight': '48000', 'Payment': '1600', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1313, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '1b8a19e9-6ddf-0fe4-8815-7a2c965d8965', 'PostId': 1269729871, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'FLAGSTAFF', 'DestState': 'AZ', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.93, 'DestLon': -111.62, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 15:25:32 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/10/2016', 'Weight': '48000', 'Payment': '875', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 625, 'TruckCoGuid': 'b712d289-1779-1412-dd68-892e42a233e6', 'PostingTruckCompanyId': 315639, 'PostGuid': 'a68a89c5-7c66-ab94-03c5-50602c6fb29a', 'PostId': 1269729292, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'SPARKS', 'DestState': 'NV', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.57, 'DestLon': -119.7, 'Length': '0', 'Phone': '215-309-7640', 'CompanyName': 'PLS LOGI', 'Entered': 'Fri, 05 Aug 2016 15:23:54 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1698127, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '875', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 625, 'TruckCoGuid': 'b712d289-1779-1412-dd68-892e42a233e6', 'PostingTruckCompanyId': 315639, 'PostGuid': 'b607b676-473e-b087-305f-9ca289c9bd3c', 'PostId': 1269729291, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'SPARKS', 'DestState': 'NV', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.57, 'DestLon': -119.7, 'Length': '0', 'Phone': '215-309-7640', 'CompanyName': 'PLS LOGI', 'Entered': 'Fri, 05 Aug 2016 15:23:54 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1698127, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '875', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 625, 'TruckCoGuid': 'b712d289-1779-1412-dd68-892e42a233e6', 'PostingTruckCompanyId': 315639, 'PostGuid': '6c27aee8-b787-b201-c4b3-66158ec7e8c3', 'PostId': 1269729290, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'SPARKS', 'DestState': 'NV', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.57, 'DestLon': -119.7, 'Length': '0', 'Phone': '215-309-7640', 'CompanyName': 'PLS LOGI', 'Entered': 'Fri, 05 Aug 2016 15:23:54 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1698127, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 103, 'PickUpDate': '8/8/2016', 'Weight': '800', 'Payment': '300', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 236, 'TruckCoGuid': '73b0a014-7979-62ab-1cbc-4af0565bf6b7', 'PostingTruckCompanyId': 158984, 'PostGuid': '1b7dfce5-475e-4f3e-d05d-161b3199b82d', 'PostId': 1269589503, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 3, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'CAVE JUNCTION', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 42.16, 'DestLon': -123.64, 'Length': '4', 'Phone': '971-279-5521', 'CompanyName': 'JAWS TRA', 'Entered': 'Fri, 05 Aug 2016 15:12:32 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 292235, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 625, 'TruckCoGuid': '93fdd1ff-3855-53b2-2dc8-4a14c6fa6114', 'PostingTruckCompanyId': 192066, 'PostGuid': '5becf8d7-4f3b-764a-8f41-2ba1ca91ad89', 'PostId': 1269724867, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'SPARKS', 'DestState': 'NV', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.57, 'DestLon': -119.7, 'Length': '48', 'Phone': '541-423-5450', 'CompanyName': 'MATSON L', 'Entered': 'Fri, 05 Aug 2016 15:10:53 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1198355, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': '0ac1498b-70d7-015a-8afb-2bfe55267de5', 'PostingTruckCompanyId': 306778, 'PostGuid': 'ca34e233-123e-c878-4d4f-1ff736df8e60', 'PostId': 1269716664, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.81, 'DestLon': -105.09, 'Length': '48', 'Phone': '800-971-3805', 'CompanyName': 'TRANSTEC', 'Entered': 'Fri, 05 Aug 2016 14:53:57 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1254157, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1313, 'TruckCoGuid': '0ac1498b-70d7-015a-8afb-2bfe55267de5', 'PostingTruckCompanyId': 306778, 'PostGuid': '5b716124-ecf7-10dd-0d2e-8a12616983d3', 'PostId': 1269716669, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'FLAGSTAFF', 'DestState': 'AZ', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.93, 'DestLon': -111.62, 'Length': '48', 'Phone': '800-971-3805', 'CompanyName': 'TRANSTEC', 'Entered': 'Fri, 05 Aug 2016 14:53:57 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1254157, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': '0ac1498b-70d7-015a-8afb-2bfe55267de5', 'PostingTruckCompanyId': 306778, 'PostGuid': '1a724374-b1d6-a306-02d2-fe52eb32fa7c', 'PostId': 1269716670, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.82, 'DestLon': -104.75, 'Length': '48', 'Phone': '800-971-3805', 'CompanyName': 'TRANSTEC', 'Entered': 'Fri, 05 Aug 2016 14:53:57 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1254157, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/8/2016', 'Weight': '43000', 'Payment': '400', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 85, 'TruckCoGuid': '71032a7d-d347-dc6a-0f88-3a4fd9aca9ab', 'PostingTruckCompanyId': 270257, 'PostGuid': '4268a471-6c18-fbe4-0345-b6c0f382b8c6', 'PostId': 1269156343, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'THE DALLES', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 73, 'OriginLat': 45.6, 'OriginLon': -121.16, 'DestCity': 'PORTLAND', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.51, 'DestLon': -122.67, 'Length': '48', 'Phone': '801-869-8182', 'CompanyName': 'A-1 FREI', 'Entered': 'Fri, 05 Aug 2016 14:43:26 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 696255, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/31/2016', 'Weight': '47000', 'Payment': '1000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 524, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '649229a6-dc22-b57b-0a3c-93ec032a90a7', 'PostId': 1268952259, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'OLIVEHURST', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.09, 'DestLon': -121.55, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Fri, 05 Aug 2016 14:40:15 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '1350', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 737, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '5c683647-51ba-d39c-3e96-9e72f6ba4335', 'PostId': 1269709665, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WARRENTON', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 74, 'OriginLat': 46.15, 'OriginLon': -123.91, 'DestCity': 'MODESTO', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.65, 'DestLon': -120.99, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Fri, 05 Aug 2016 14:37:43 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/31/2016', 'Weight': '47000', 'Payment': '1350', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 737, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': 'ece73ea0-8f27-27a1-6096-85b65420ccb6', 'PostId': 1269353330, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WARRENTON', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 74, 'OriginLat': 46.15, 'OriginLon': -123.91, 'DestCity': 'MODESTO', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.65, 'DestLon': -120.99, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Fri, 05 Aug 2016 14:37:43 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '1500', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 928, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '4cb0234b-c496-ea3f-7d17-33862eb7ca90', 'PostId': 1269706865, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'GOLETA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.46, 'DestLon': -119.8, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Fri, 05 Aug 2016 14:32:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/30/2016', 'Weight': '47000', 'Payment': '1500', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 928, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '59499158-8894-d56e-4e98-f38a26d8c800', 'PostId': 1268952258, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 55, 'OriginLat': 45.06, 'OriginLon': -123.59, 'DestCity': 'GOLETA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.46, 'DestLon': -119.8, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Fri, 05 Aug 2016 14:32:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '850', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1082, 'TruckCoGuid': '6bc0044b-f1b3-b7b9-7d1f-bc58e7f76747', 'PostingTruckCompanyId': 324919, 'PostGuid': 'b1a368a4-5aa2-1973-f187-0485279c917c', 'PostId': 1269706514, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'SAN DIEGO', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 32.74, 'DestLon': -117.1, 'Length': '', 'Phone': '703-835-3849', 'CompanyName': 'FREIGHT ', 'Entered': 'Fri, 05 Aug 2016 14:31:17 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1652603, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/5/2016', 'Weight': '48000', 'Payment': '1500', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 799, 'TruckCoGuid': '631ed7bb-97ef-ff96-4cb9-ae42f4b91dff', 'PostingTruckCompanyId': 195688, 'PostGuid': 'acbfb5f7-7e63-d846-a706-e11027a50133', 'PostId': 1269231994, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WARRENTON', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 74, 'OriginLat': 46.15, 'OriginLon': -123.91, 'DestCity': 'IDAHO FALLS', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.51, 'DestLon': -111.92, 'Length': '48', 'Phone': '662-416-8531', 'CompanyName': 'SOUTHERN', 'Entered': 'Fri, 05 Aug 2016 14:23:19 GMT', 'IsDaily': true, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 65479, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 625, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '597f947e-18a8-d84e-bcf8-fa2cfd5aab56', 'PostId': 1269699398, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'SPARKS', 'DestState': 'NV', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.53, 'DestLon': -119.74, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 14:13:29 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 625, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '0a62c0b0-0923-4d96-98a8-a484453700ef', 'PostId': 1269699401, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'SPARKS', 'DestState': 'NV', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.53, 'DestLon': -119.74, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 14:13:29 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/10/2016', 'Weight': '48000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 625, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '78fd961e-73d8-b3ff-2261-09c9d64a0f7a', 'PostId': 1269699406, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'SPARKS', 'DestState': 'NV', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.53, 'DestLon': -119.74, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 14:13:29 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/11/2016', 'Weight': '48000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 625, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '26f5108d-ecf1-d054-2e05-6e7185ff10bc', 'PostId': 1269699408, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'SPARKS', 'DestState': 'NV', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.53, 'DestLon': -119.74, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 14:13:29 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/12/2016', 'Weight': '48000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 625, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '30fe78e8-66a7-bd9b-b3ea-0d3d0b81fdb6', 'PostId': 1269699412, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RAINIER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 39, 'OriginLat': 46.06, 'OriginLon': -122.85, 'DestCity': 'SPARKS', 'DestState': 'NV', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.53, 'DestLon': -119.74, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Fri, 05 Aug 2016 14:13:29 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 799, 'TruckCoGuid': '7aa09310-6f07-9cc3-b6c1-e7634ced2f39', 'PostingTruckCompanyId': 309737, 'PostGuid': '9a08d3df-52e8-2d61-c4ab-5336baa94c42', 'PostId': 1269695516, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WARRENTON', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 74, 'OriginLat': 46.15, 'OriginLon': -123.91, 'DestCity': 'IDAHO FALLS', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.51, 'DestLon': -111.92, 'Length': '0', 'Phone': '256-727-5122', 'CompanyName': 'ALABAMA ', 'Entered': 'Fri, 05 Aug 2016 14:03:24 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1614194, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 99, 'TruckCoGuid': 'f659c10f-7666-4898-5bc2-f47fa59344a1', 'PostingTruckCompanyId': 74335, 'PostGuid': '67748d1b-a9f8-275e-dc88-ec09ad9ced99', 'PostId': 1269683885, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'DALLESPORT', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 73, 'OriginLat': 45.6, 'OriginLon': -121.16, 'DestCity': 'ALOHA', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.48, 'DestLon': -122.85, 'Length': '48', 'Phone': '888-290-1593', 'CompanyName': 'M MILLER', 'Entered': 'Fri, 05 Aug 2016 13:40:51 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 5428, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/9/2016', 'Weight': '20000', 'Payment': '1000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 498, 'TruckCoGuid': '9249d1e3-d235-d77c-ed12-7477e7909127', 'PostingTruckCompanyId': 149589, 'PostGuid': 'eb24a9cd-0108-ab7b-b920-10fb899bc06b', 'PostId': 1269668543, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'MCCALL', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.83, 'DestLon': -116.07, 'Length': '40', 'Phone': '402-336-3374', 'CompanyName': 'ADVANTAG', 'Entered': 'Fri, 05 Aug 2016 13:07:33 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 164497, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '350', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 99, 'TruckCoGuid': 'feaf201f-d809-c9fd-ada2-8bdf84c1fdca', 'PostingTruckCompanyId': 91870, 'PostGuid': '4246251c-f47c-ed00-5cfa-274c0381fafe', 'PostId': 1269663253, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'DALLESPORT', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 73, 'OriginLat': 45.6, 'OriginLon': -121.16, 'DestCity': 'ALOHA', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.48, 'DestLon': -122.85, 'Length': '0', 'Phone': '863-324-4872', 'CompanyName': 'NELSON T', 'Entered': 'Fri, 05 Aug 2016 12:57:03 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 994948, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 202, 'PickUpDate': '8/10/2016', 'Weight': '48000', 'Payment': '1650', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': 'eb9c8697-4d47-ce88-3b3e-f16f2113e7f6', 'PostingTruckCompanyId': 127284, 'PostGuid': 'de451419-27e0-aa5b-be1b-052cc1c079e5', 'PostId': 1269615488, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.82, 'DestLon': -104.75, 'Length': '0', 'Phone': '406-322-8658', 'CompanyName': 'AMERICAN', 'Entered': 'Fri, 05 Aug 2016 03:46:39 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 353699, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 202, 'PickUpDate': '8/12/2016', 'Weight': '48000', 'Payment': '1650', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': 'eb9c8697-4d47-ce88-3b3e-f16f2113e7f6', 'PostingTruckCompanyId': 127284, 'PostGuid': 'e2c95c24-0e4a-ba7e-dd10-a22074cc085c', 'PostId': 1269615489, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.82, 'DestLon': -104.75, 'Length': '0', 'Phone': '406-322-8658', 'CompanyName': 'AMERICAN', 'Entered': 'Fri, 05 Aug 2016 03:46:39 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 353699, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 202, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '1650', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': 'eb9c8697-4d47-ce88-3b3e-f16f2113e7f6', 'PostingTruckCompanyId': 127284, 'PostGuid': '9b887d3f-a724-d897-aa64-abc2c5066ae9', 'PostId': 1269615486, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.82, 'DestLon': -104.75, 'Length': '0', 'Phone': '406-322-8658', 'CompanyName': 'AMERICAN', 'Entered': 'Fri, 05 Aug 2016 03:46:39 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 353699, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 202, 'PickUpDate': '8/11/2016', 'Weight': '48000', 'Payment': '1650', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': 'eb9c8697-4d47-ce88-3b3e-f16f2113e7f6', 'PostingTruckCompanyId': 127284, 'PostGuid': 'ec4ea577-509a-c9eb-68f7-55eca78284c6', 'PostId': 1269615487, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.82, 'DestLon': -104.75, 'Length': '0', 'Phone': '406-322-8658', 'CompanyName': 'AMERICAN', 'Entered': 'Fri, 05 Aug 2016 03:46:39 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 353699, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 202, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1650', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': 'eb9c8697-4d47-ce88-3b3e-f16f2113e7f6', 'PostingTruckCompanyId': 127284, 'PostGuid': '85874e23-8c3d-1160-a55b-177c672a79fc', 'PostId': 1269615485, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.82, 'DestLon': -104.75, 'Length': '0', 'Phone': '406-322-8658', 'CompanyName': 'AMERICAN', 'Entered': 'Fri, 05 Aug 2016 03:46:39 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 353699, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 202, 'PickUpDate': '8/12/2016', 'Weight': '48000', 'Payment': '1550', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': 'eb9c8697-4d47-ce88-3b3e-f16f2113e7f6', 'PostingTruckCompanyId': 127284, 'PostGuid': 'f1233b5e-e6fa-e478-36d0-8a25338acc45', 'PostId': 1269615473, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.75, 'DestLon': -104.99, 'Length': '0', 'Phone': '406-322-8658', 'CompanyName': 'AMERICAN', 'Entered': 'Fri, 05 Aug 2016 03:46:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 353699, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 202, 'PickUpDate': '8/11/2016', 'Weight': '48000', 'Payment': '1550', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': 'eb9c8697-4d47-ce88-3b3e-f16f2113e7f6', 'PostingTruckCompanyId': 127284, 'PostGuid': 'e6a82bad-08ad-661f-a256-f3fa86b38aab', 'PostId': 1269615471, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.75, 'DestLon': -104.99, 'Length': '0', 'Phone': '406-322-8658', 'CompanyName': 'AMERICAN', 'Entered': 'Fri, 05 Aug 2016 03:46:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 353699, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 202, 'PickUpDate': '8/10/2016', 'Weight': '48000', 'Payment': '1550', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': 'eb9c8697-4d47-ce88-3b3e-f16f2113e7f6', 'PostingTruckCompanyId': 127284, 'PostGuid': '055c28a4-0392-b919-30a0-240b79f7be59', 'PostId': 1269615472, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.75, 'DestLon': -104.99, 'Length': '0', 'Phone': '406-322-8658', 'CompanyName': 'AMERICAN', 'Entered': 'Fri, 05 Aug 2016 03:46:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 353699, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 202, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1550', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': 'eb9c8697-4d47-ce88-3b3e-f16f2113e7f6', 'PostingTruckCompanyId': 127284, 'PostGuid': '6c2ccab3-059e-bbd6-2181-fef629adee0d', 'PostId': 1269615469, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.75, 'DestLon': -104.99, 'Length': '0', 'Phone': '406-322-8658', 'CompanyName': 'AMERICAN', 'Entered': 'Fri, 05 Aug 2016 03:46:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 353699, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 202, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '1550', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': 'eb9c8697-4d47-ce88-3b3e-f16f2113e7f6', 'PostingTruckCompanyId': 127284, 'PostGuid': '6dc748c9-9860-b179-4ccb-d4fd6a8ec87f', 'PostId': 1269615470, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.75, 'DestLon': -104.99, 'Length': '0', 'Phone': '406-322-8658', 'CompanyName': 'AMERICAN', 'Entered': 'Fri, 05 Aug 2016 03:46:01 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 353699, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 503, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 2617, 'TruckCoGuid': '2f693e6a-dfa3-319d-2af8-f46bf8bc8871', 'PostingTruckCompanyId': 319448, 'PostGuid': '1211a311-5a99-46fd-436b-d17416eb5a0f', 'PostId': 1269545578, 'EquipmentType': 'CONG', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CHEHALIS', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 81, 'OriginLat': 46.66, 'OriginLon': -122.95, 'DestCity': 'IRWIN', 'DestState': 'PA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 40.33, 'DestLon': -79.72, 'Length': '', 'Phone': '920-358-5289', 'CompanyName': 'ARI LOGI', 'Entered': 'Thu, 04 Aug 2016 23:29:15 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1122251, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 503, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 2617, 'TruckCoGuid': '2f693e6a-dfa3-319d-2af8-f46bf8bc8871', 'PostingTruckCompanyId': 319448, 'PostGuid': 'f2001a1c-1d7e-1771-f336-4fb2f4c1948e', 'PostId': 1269545577, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CHEHALIS', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 81, 'OriginLat': 46.66, 'OriginLon': -122.95, 'DestCity': 'IRWIN', 'DestState': 'PA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 40.33, 'DestLon': -79.72, 'Length': '', 'Phone': '920-358-5289', 'CompanyName': 'ARI LOGI', 'Entered': 'Thu, 04 Aug 2016 23:29:15 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1122251, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '40000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1270, 'TruckCoGuid': '3e45e614-11f7-fa05-a2dd-6be3934e7532', 'PostingTruckCompanyId': 60819, 'PostGuid': '6f23dddd-f349-fabe-9e05-7a3481783e9a', 'PostId': 1269607197, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LEBANON', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 62, 'OriginLat': 44.62, 'OriginLon': -122.88, 'DestCity': 'PHOENIX', 'DestState': 'AZ', 'DestCtry': '', 'DestDist': 0, 'DestLat': 33.44, 'DestLon': -112.06, 'Length': '48', 'Phone': '800-743-1911', 'CompanyName': 'TRI CONT', 'Entered': 'Thu, 04 Aug 2016 22:36:38 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 104918, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '859', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 669, 'TruckCoGuid': '70f708b6-cbc0-e70d-2996-6146a4e4f036', 'PostingTruckCompanyId': 133041, 'PostGuid': 'b28d34c5-9835-3aec-fc37-70842af477ef', 'PostId': 1267287151, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MIST', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 46, 'OriginLat': 45.99, 'OriginLon': -123.33, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': '0', 'Phone': '801-254-1000', 'CompanyName': 'V C LOGI', 'Entered': 'Thu, 04 Aug 2016 22:22:08 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15217, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '859', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 654, 'TruckCoGuid': '70f708b6-cbc0-e70d-2996-6146a4e4f036', 'PostingTruckCompanyId': 133041, 'PostGuid': '60a3badc-dcb7-27b6-9cbe-fab66748cf9a', 'PostId': 1267287380, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'KALAMA', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 34, 'OriginLat': 45.99, 'OriginLon': -122.83, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': '0', 'Phone': '801-254-1000', 'CompanyName': 'V C LOGI', 'Entered': 'Thu, 04 Aug 2016 22:22:08 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15217, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1050', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 524, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'eb787917-2b29-e5f1-27fa-8fee578080dd', 'PostId': 1269596026, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 50, 'OriginLat': 45.06, 'OriginLon': -123.48, 'DestCity': 'OLIVEHURST', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.09, 'DestLon': -121.55, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 20:52:18 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 579, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'bef2e922-f646-f292-6ef6-f59e645674b7', 'PostId': 1269596027, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 50, 'OriginLat': 45.06, 'OriginLon': -123.48, 'DestCity': 'ELK GROVE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.4, 'DestLon': -121.26, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 20:52:18 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 579, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '23ec0343-43e1-599b-6b0f-83cb2273a0c2', 'PostId': 1269596029, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 50, 'OriginLat': 45.06, 'OriginLon': -123.48, 'DestCity': 'ELK GROVE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.4, 'DestLon': -121.26, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 20:52:18 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '1050', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 524, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '9701414c-1118-bd52-9675-c31acbaafd57', 'PostId': 1269596030, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 50, 'OriginLat': 45.06, 'OriginLon': -123.48, 'DestCity': 'OLIVEHURST', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.09, 'DestLon': -121.55, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 20:52:18 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/10/2016', 'Weight': '48000', 'Payment': '1050', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 524, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'c9317cc1-0f7e-5c5f-9904-ca78edc7c1be', 'PostId': 1269596035, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 50, 'OriginLat': 45.06, 'OriginLon': -123.48, 'DestCity': 'OLIVEHURST', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.09, 'DestLon': -121.55, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 20:52:18 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/10/2016', 'Weight': '48000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 579, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '74c9ddb2-01ea-b139-9133-a805b82db8f8', 'PostId': 1269596036, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 50, 'OriginLat': 45.06, 'OriginLon': -123.48, 'DestCity': 'ELK GROVE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.4, 'DestLon': -121.26, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 20:52:18 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/11/2016', 'Weight': '48000', 'Payment': '1050', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 524, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'b8707621-900e-a0aa-ee99-900c21678135', 'PostId': 1269596039, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 50, 'OriginLat': 45.06, 'OriginLon': -123.48, 'DestCity': 'OLIVEHURST', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.09, 'DestLon': -121.55, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 20:52:18 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/11/2016', 'Weight': '48000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 579, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'f74d0b55-6f0d-ea36-3e67-0adce70559e8', 'PostId': 1269596040, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 50, 'OriginLat': 45.06, 'OriginLon': -123.48, 'DestCity': 'ELK GROVE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.4, 'DestLon': -121.26, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 20:52:18 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/12/2016', 'Weight': '48000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 579, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '4c388c23-917b-b549-f194-c5e46f0e5f7c', 'PostId': 1269596044, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 50, 'OriginLat': 45.06, 'OriginLon': -123.48, 'DestCity': 'ELK GROVE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.4, 'DestLon': -121.26, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 20:52:18 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '350', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 99, 'TruckCoGuid': 'cbfdf570-13c6-7834-911a-d5e89ed18e1d', 'PostingTruckCompanyId': 337762, 'PostGuid': 'fc97edb0-2656-e162-4335-418f5503a946', 'PostId': 1269589845, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'DALLESPORT', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 73, 'OriginLat': 45.6, 'OriginLon': -121.16, 'DestCity': 'ALOHA', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.48, 'DestLon': -122.85, 'Length': '48', 'Phone': '619-400-6979', 'CompanyName': 'COASTAL ', 'Entered': 'Thu, 04 Aug 2016 20:21:38 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1672950, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 48, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '8efda67e-85bf-292e-f16d-4c6b2434d76a', 'PostId': 1269564788, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LONGVIEW', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 45, 'OriginLat': 46.14, 'OriginLon': -122.9, 'DestCity': 'PORTLAND', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.51, 'DestLon': -122.67, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 19:08:10 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 48, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '4d9c2ded-8163-2f35-0081-2ba30f8bad90', 'PostId': 1269564792, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LONGVIEW', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 45, 'OriginLat': 46.14, 'OriginLon': -122.9, 'DestCity': 'PORTLAND', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.51, 'DestLon': -122.67, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 19:08:10 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/10/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 48, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '50810747-b5e8-1f6e-3ab3-fc78099a8d25', 'PostId': 1269564795, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LONGVIEW', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 45, 'OriginLat': 46.14, 'OriginLon': -122.9, 'DestCity': 'PORTLAND', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.51, 'DestLon': -122.67, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 19:08:10 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/11/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 48, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'e171129c-f7fb-e640-5959-d0ebf6a1771c', 'PostId': 1269564799, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LONGVIEW', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 45, 'OriginLat': 46.14, 'OriginLon': -122.9, 'DestCity': 'PORTLAND', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.51, 'DestLon': -122.67, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 19:08:10 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/12/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 48, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '84426ab1-fd3b-f314-5b65-edf65eaeecdd', 'PostId': 1269564801, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LONGVIEW', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 45, 'OriginLat': 46.14, 'OriginLon': -122.9, 'DestCity': 'PORTLAND', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.51, 'DestLon': -122.67, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 19:08:10 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': ' ', 'Payment': '300', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 99, 'TruckCoGuid': '82a224f3-b422-f9f2-6567-e36caa856ca9', 'PostingTruckCompanyId': 277699, 'PostGuid': '9ccf0416-fa09-1a15-8fe7-ad1bdaf03ebe', 'PostId': 1269559613, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'DALLESPORT', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 73, 'OriginLat': 45.6, 'OriginLon': -121.16, 'DestCity': 'ALOHA', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.48, 'DestLon': -122.85, 'Length': ' ', 'Phone': '931-358-4504', 'CompanyName': 'OHIO VAL', 'Entered': 'Thu, 04 Aug 2016 18:51:13 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 631343, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1210, 'TruckCoGuid': 'f659c10f-7666-4898-5bc2-f47fa59344a1', 'PostingTruckCompanyId': 74335, 'PostGuid': '788f5518-5da9-2b9b-78f1-7da407d1f0fb', 'PostId': 1269559162, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CHEHALIS', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 81, 'OriginLat': 46.66, 'OriginLon': -122.95, 'DestCity': 'RAPID CITY', 'DestState': 'SD', 'DestCtry': '', 'DestDist': 0, 'DestLat': 44.08, 'DestLon': -103.23, 'Length': '48', 'Phone': '888-290-1593', 'CompanyName': 'M MILLER', 'Entered': 'Thu, 04 Aug 2016 18:49:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 5428, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 99, 'TruckCoGuid': 'f659c10f-7666-4898-5bc2-f47fa59344a1', 'PostingTruckCompanyId': 74335, 'PostGuid': '8e93a608-22a9-df04-5731-2d1f9adb32c9', 'PostId': 1269553499, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'DALLESPORT', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 73, 'OriginLat': 45.6, 'OriginLon': -121.16, 'DestCity': 'ALOHA', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.48, 'DestLon': -122.85, 'Length': '48', 'Phone': '888-290-1593', 'CompanyName': 'M MILLER', 'Entered': 'Thu, 04 Aug 2016 18:32:05 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 5428, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '350', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 99, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'b5a4e444-f40c-bc33-9a81-728ca52fe21f', 'PostId': 1269534482, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'DALLESPORT', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 73, 'OriginLat': 45.6, 'OriginLon': -121.16, 'DestCity': 'ALOHA', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.48, 'DestLon': -122.85, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 17:32:11 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '350', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 99, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '04454973-d7ea-fcbd-624a-f27912be6499', 'PostId': 1269534483, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'DALLESPORT', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 73, 'OriginLat': 45.6, 'OriginLon': -121.16, 'DestCity': 'ALOHA', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.48, 'DestLon': -122.85, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 17:32:11 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/10/2016', 'Weight': '48000', 'Payment': '350', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 99, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'd752dd52-6590-9a34-46e9-a902b42b82e8', 'PostId': 1269534484, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'DALLESPORT', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 73, 'OriginLat': 45.6, 'OriginLon': -121.16, 'DestCity': 'ALOHA', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.48, 'DestLon': -122.85, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 17:32:11 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/11/2016', 'Weight': '48000', 'Payment': '350', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 99, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '9a9e258d-eb8f-b499-c36a-8014651c6c23', 'PostId': 1269534485, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'DALLESPORT', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 73, 'OriginLat': 45.6, 'OriginLon': -121.16, 'DestCity': 'ALOHA', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.48, 'DestLon': -122.85, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 17:32:11 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/12/2016', 'Weight': '48000', 'Payment': '350', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 99, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '00fc2ee2-ed46-7c6f-cb10-4d5c226d2140', 'PostId': 1269534486, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'DALLESPORT', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 73, 'OriginLat': 45.6, 'OriginLon': -121.16, 'DestCity': 'ALOHA', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.48, 'DestLon': -122.85, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 17:32:11 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '400', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 99, 'TruckCoGuid': '4602c677-d539-3647-5bf2-7549db16a60c', 'PostingTruckCompanyId': 339353, 'PostGuid': '6e861c32-de88-c1a2-9251-583f46459ffd', 'PostId': 1269530412, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'DALLESPORT', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 73, 'OriginLat': 45.6, 'OriginLon': -121.16, 'DestCity': 'ALOHA', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.48, 'DestLon': -122.85, 'Length': ' ', 'Phone': '971-925-0121', 'CompanyName': 'SHERWOOD', 'Entered': 'Thu, 04 Aug 2016 17:19:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1704276, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/30/2016', 'Weight': '47000', 'Payment': '1650', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 992, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '303041e6-96ea-b389-4ada-89128cb50335', 'PostId': 1269226307, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'TILLAMOOK', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.44, 'OriginLon': -123.83, 'DestCity': 'LOS ANGELES', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.06, 'DestLon': -118.3, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Thu, 04 Aug 2016 16:02:33 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 609, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'f26364de-7b64-add2-0f2a-da0fd1ba3fa1', 'PostId': 1269499447, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 15:56:09 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 609, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'b9f6edbd-4e98-e280-ed91-90483b358be1', 'PostId': 1269499454, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 15:56:09 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/10/2016', 'Weight': '48000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 609, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '7978bca2-08d8-99cc-3946-34104c0d6e39', 'PostId': 1269499461, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 15:56:09 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/11/2016', 'Weight': '48000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 609, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'f314ef09-6e92-c104-3089-0a61e2ac1770', 'PostId': 1269499468, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 15:56:09 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/12/2016', 'Weight': '48000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 609, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '63027cc2-e0e2-89ea-5a74-8cf95a5da3a4', 'PostId': 1269499475, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 15:56:09 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 578, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'c580ae48-e424-615b-9a30-f6e0944c363a', 'PostId': 1269487954, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 50, 'OriginLat': 45.06, 'OriginLon': -123.48, 'DestCity': 'ROSEVILLE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.74, 'DestLon': -121.29, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 15:27:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '1000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 578, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '66cb3c96-963e-3e64-2284-258c8426c4e2', 'PostId': 1269487959, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 50, 'OriginLat': 45.06, 'OriginLon': -123.48, 'DestCity': 'ROSEVILLE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.74, 'DestLon': -121.29, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 15:27:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/10/2016', 'Weight': '48000', 'Payment': '1000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 578, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '1086e31a-04d4-0028-bc56-0809ca29c870', 'PostId': 1269487962, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 50, 'OriginLat': 45.06, 'OriginLon': -123.48, 'DestCity': 'ROSEVILLE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.74, 'DestLon': -121.29, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 15:27:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/11/2016', 'Weight': '48000', 'Payment': '1000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 578, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '744685a4-7f1d-3850-02d4-3606e0378c15', 'PostId': 1269487967, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 50, 'OriginLat': 45.06, 'OriginLon': -123.48, 'DestCity': 'ROSEVILLE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.74, 'DestLon': -121.29, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 15:27:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/12/2016', 'Weight': '48000', 'Payment': '1000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 578, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'fea752c0-98a7-b768-c2b6-4e3e2bd1e505', 'PostId': 1269487973, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'WILLAMINA', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 50, 'OriginLat': 45.06, 'OriginLon': -123.48, 'DestCity': 'ROSEVILLE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.74, 'DestLon': -121.29, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 15:27:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1400', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 704, 'TruckCoGuid': 'b4e52919-fbe6-1dc5-1077-8fac033cf4b6', 'PostingTruckCompanyId': 79496, 'PostGuid': '76a7878e-f82f-63b4-ab98-5c5a19bd225b', 'PostId': 1269487167, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'TUALATIN', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 10, 'OriginLat': 45.37, 'OriginLon': -122.75, 'DestCity': 'WATSONVILLE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 36.92, 'DestLon': -121.76, 'Length': ' ', 'Phone': '801-621-6644', 'CompanyName': 'KONECNY ', 'Entered': 'Thu, 04 Aug 2016 15:25:08 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 35206, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/22/2016', 'Weight': '47000', 'Payment': '1100', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 657, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': 'c21e2c75-d3fe-d75c-01a4-88acaabf767b', 'PostId': 1268779714, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'RIVERBANK', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.73, 'DestLon': -120.93, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Thu, 04 Aug 2016 14:45:32 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/10/2016', 'Weight': ' ', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 2779, 'TruckCoGuid': '433cbfe5-065f-cc12-6192-ea79681909f7', 'PostingTruckCompanyId': 275494, 'PostGuid': 'e9c4e342-5c04-cc52-52cf-2b4b3168ec5c', 'PostId': 1269455051, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'KALAMA', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 34, 'OriginLat': 45.99, 'OriginLon': -122.83, 'DestCity': 'STANLEY', 'DestState': 'NC', 'DestCtry': '', 'DestDist': 0, 'DestLat': 35.34, 'DestLon': -81.09, 'Length': ' ', 'Phone': '980-242-4450', 'CompanyName': 'PLS LOGI', 'Entered': 'Thu, 04 Aug 2016 14:17:43 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 698706, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/10/2016', 'Weight': ' ', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 2957, 'TruckCoGuid': '433cbfe5-065f-cc12-6192-ea79681909f7', 'PostingTruckCompanyId': 275494, 'PostGuid': '35d62736-9ea4-c145-977a-a90e1343b97e', 'PostId': 1269455060, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'KALAMA', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 34, 'OriginLat': 45.99, 'OriginLon': -122.83, 'DestCity': 'CONWAY', 'DestState': 'SC', 'DestCtry': '', 'DestDist': 0, 'DestLat': 33.82, 'DestLon': -79.04, 'Length': ' ', 'Phone': '980-242-4450', 'CompanyName': 'PLS LOGI', 'Entered': 'Thu, 04 Aug 2016 14:17:43 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 698706, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1600', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '5c6836b1-d0fb-b889-e4f3-f99596dd84e6', 'PostId': 1269451079, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39, 'DestLon': -104.7, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 14:11:36 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '1600', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'eceb3cf8-b616-fbc2-09a2-b4babb5010d5', 'PostId': 1269451150, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39, 'DestLon': -104.7, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 14:11:36 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/10/2016', 'Weight': '48000', 'Payment': '1600', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '6041303a-3d79-d228-733b-8800efadd0ec', 'PostId': 1269451192, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39, 'DestLon': -104.7, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 14:11:36 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/11/2016', 'Weight': '48000', 'Payment': '1600', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '28584453-e1d8-fde8-a726-897ffa563ba7', 'PostId': 1269451250, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39, 'DestLon': -104.7, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 14:11:36 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/12/2016', 'Weight': '48000', 'Payment': '1600', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '70aa0350-b9d3-4f37-814a-71ea8da51207', 'PostId': 1269451306, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39, 'DestLon': -104.7, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 14:11:36 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': '47000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 431, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '5ef38c89-fbbe-5108-111c-cfc6472be736', 'PostId': 1269451361, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'BOISE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.63, 'DestLon': -116.33, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 14:11:36 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1500', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '69394ff3-009e-a3e7-2532-96f866a8fd90', 'PostId': 1269451384, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.81, 'DestLon': -105.09, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 14:11:36 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '47000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 431, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '05e34825-4238-0b2c-848b-3802468275c6', 'PostId': 1269451396, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'BOISE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.63, 'DestLon': -116.33, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 14:11:36 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/9/2016', 'Weight': '48000', 'Payment': '1500', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '1930501c-d06b-4723-3b71-52b70bb032d7', 'PostId': 1269451413, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.81, 'DestLon': -105.09, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 14:11:36 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/10/2016', 'Weight': '47000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 431, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '4d61068c-4d7d-7762-711e-2937f630a136', 'PostId': 1269451429, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'BOISE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.63, 'DestLon': -116.33, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 14:11:36 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/10/2016', 'Weight': '48000', 'Payment': '1500', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '822835bf-f2e3-f1a7-9b9a-027eb691dae8', 'PostId': 1269451449, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.81, 'DestLon': -105.09, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 14:11:36 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/11/2016', 'Weight': '47000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 431, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '65d479eb-2cd4-a7f6-8563-2b33418635ea', 'PostId': 1269451461, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'BOISE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.63, 'DestLon': -116.33, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 14:11:36 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/11/2016', 'Weight': '48000', 'Payment': '1500', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'f86926fb-a260-9995-4399-a341afaf7eb3', 'PostId': 1269451487, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.81, 'DestLon': -105.09, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 14:11:36 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/12/2016', 'Weight': '47000', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 431, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': 'aa9bec12-a7e5-c754-c17d-2c64621d9c22', 'PostId': 1269451494, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'BOISE', 'DestState': 'ID', 'DestCtry': '', 'DestDist': 0, 'DestLat': 43.63, 'DestLon': -116.33, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 14:11:36 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 1003, 'PickUpDate': '8/12/2016', 'Weight': '48000', 'Payment': '1500', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': '9851a842-70b4-16e6-6019-cc4c4072b894', 'PostingTruckCompanyId': 68804, 'PostGuid': '8c9cdedb-fd34-8713-7c31-132b2ba6d9f9', 'PostId': 1269451520, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.81, 'DestLon': -105.09, 'Length': '45', 'Phone': '714-840-5366', 'CompanyName': 'STRAIGHT', 'Entered': 'Thu, 04 Aug 2016 14:11:36 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15607, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1650', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1350, 'TruckCoGuid': 'b712d289-1779-1412-dd68-892e42a233e6', 'PostingTruckCompanyId': 315639, 'PostGuid': '1ac6a61a-542d-6ad4-11a9-1bf0db615160', 'PostId': 1269441626, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CARSON', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 44, 'OriginLat': 45.71, 'OriginLon': -121.8, 'DestCity': 'COLORADO SPRINGS', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.82, 'DestLon': -104.75, 'Length': '0', 'Phone': '215-309-7640', 'CompanyName': 'PLS LOGI', 'Entered': 'Thu, 04 Aug 2016 13:52:16 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1698127, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/12/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 2957, 'TruckCoGuid': '433cbfe5-065f-cc12-6192-ea79681909f7', 'PostingTruckCompanyId': 275494, 'PostGuid': 'a3073293-f8d1-b0eb-1f7b-ceb573d76c71', 'PostId': 1269440515, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'KALAMA', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 34, 'OriginLat': 45.99, 'OriginLon': -122.83, 'DestCity': 'CONWAY', 'DestState': 'SC', 'DestCtry': '', 'DestDist': 0, 'DestLat': 33.82, 'DestLon': -79.04, 'Length': '0', 'Phone': '980-242-4450', 'CompanyName': 'PLS LOGI', 'Entered': 'Thu, 04 Aug 2016 13:49:50 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1739319, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/11/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 2957, 'TruckCoGuid': '433cbfe5-065f-cc12-6192-ea79681909f7', 'PostingTruckCompanyId': 275494, 'PostGuid': '49099055-7aca-c647-23f4-002f6eb30b74', 'PostId': 1269440514, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'KALAMA', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 34, 'OriginLat': 45.99, 'OriginLon': -122.83, 'DestCity': 'CONWAY', 'DestState': 'SC', 'DestCtry': '', 'DestDist': 0, 'DestLat': 33.82, 'DestLon': -79.04, 'Length': '0', 'Phone': '980-242-4450', 'CompanyName': 'PLS LOGI', 'Entered': 'Thu, 04 Aug 2016 13:49:50 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1739319, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/10/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 2957, 'TruckCoGuid': '433cbfe5-065f-cc12-6192-ea79681909f7', 'PostingTruckCompanyId': 275494, 'PostGuid': '73034045-b264-ac1c-2968-71022eaed5ec', 'PostId': 1269440513, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'KALAMA', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 34, 'OriginLat': 45.99, 'OriginLon': -122.83, 'DestCity': 'CONWAY', 'DestState': 'SC', 'DestCtry': '', 'DestDist': 0, 'DestLat': 33.82, 'DestLon': -79.04, 'Length': '0', 'Phone': '980-242-4450', 'CompanyName': 'PLS LOGI', 'Entered': 'Thu, 04 Aug 2016 13:49:50 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1739319, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/12/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 2779, 'TruckCoGuid': '433cbfe5-065f-cc12-6192-ea79681909f7', 'PostingTruckCompanyId': 275494, 'PostGuid': '64dbf35a-f394-d8ce-1eba-2accc7365226', 'PostId': 1269440176, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'KALAMA', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 34, 'OriginLat': 45.99, 'OriginLon': -122.83, 'DestCity': 'STANLEY', 'DestState': 'NC', 'DestCtry': '', 'DestDist': 0, 'DestLat': 35.34, 'DestLon': -81.09, 'Length': '0', 'Phone': '980-242-4450', 'CompanyName': 'PLS LOGI', 'Entered': 'Thu, 04 Aug 2016 13:49:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1739319, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/11/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 2779, 'TruckCoGuid': '433cbfe5-065f-cc12-6192-ea79681909f7', 'PostingTruckCompanyId': 275494, 'PostGuid': '65444321-bead-39bf-7a77-5aaa44a058bd', 'PostId': 1269440175, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'KALAMA', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 34, 'OriginLat': 45.99, 'OriginLon': -122.83, 'DestCity': 'STANLEY', 'DestState': 'NC', 'DestCtry': '', 'DestDist': 0, 'DestLat': 35.34, 'DestLon': -81.09, 'Length': '0', 'Phone': '980-242-4450', 'CompanyName': 'PLS LOGI', 'Entered': 'Thu, 04 Aug 2016 13:49:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1739319, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/10/2016', 'Weight': '0', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 2779, 'TruckCoGuid': '433cbfe5-065f-cc12-6192-ea79681909f7', 'PostingTruckCompanyId': 275494, 'PostGuid': '0e34e229-813e-0e01-2097-c62094be9734', 'PostId': 1269440174, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'KALAMA', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 34, 'OriginLat': 45.99, 'OriginLon': -122.83, 'DestCity': 'STANLEY', 'DestState': 'NC', 'DestCtry': '', 'DestDist': 0, 'DestLat': 35.34, 'DestLon': -81.09, 'Length': '0', 'Phone': '980-242-4450', 'CompanyName': 'PLS LOGI', 'Entered': 'Thu, 04 Aug 2016 13:49:23 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1739319, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '1550', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1234, 'TruckCoGuid': 'b712d289-1779-1412-dd68-892e42a233e6', 'PostingTruckCompanyId': 315639, 'PostGuid': 'b625c766-3e79-67e4-5745-42d4ce99e7cb', 'PostId': 1269439880, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LYONS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 51, 'OriginLat': 44.78, 'OriginLon': -122.61, 'DestCity': 'DENVER', 'DestState': 'CO', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.75, 'DestLon': -104.99, 'Length': '0', 'Phone': '215-309-7640', 'CompanyName': 'PLS LOGI', 'Entered': 'Thu, 04 Aug 2016 13:48:22 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1698127, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '12/31/1999', 'Weight': '0', 'Payment': '900', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 609, 'TruckCoGuid': '433cbfe5-065f-cc12-6192-ea79681909f7', 'PostingTruckCompanyId': 275494, 'PostGuid': '24a491f8-0d32-5342-3929-16e0b454a8e0', 'PostId': 1269346684, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'ODELL', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.61, 'OriginLon': -121.53, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': '0', 'Phone': '980-242-4450', 'CompanyName': 'PLS LOGI', 'Entered': 'Thu, 04 Aug 2016 12:58:57 GMT', 'IsDaily': true, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1641610, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '859', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 654, 'TruckCoGuid': '70f708b6-cbc0-e70d-2996-6146a4e4f036', 'PostingTruckCompanyId': 133041, 'PostGuid': '1ac24c32-0343-d549-f5d6-fe8517d8e0f9', 'PostId': 1269403109, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'KALAMA', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 34, 'OriginLat': 45.99, 'OriginLon': -122.83, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': '0', 'Phone': '801-254-1000', 'CompanyName': 'V C LOGI', 'Entered': 'Thu, 04 Aug 2016 12:41:33 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15217, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 203, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '859', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 669, 'TruckCoGuid': '70f708b6-cbc0-e70d-2996-6146a4e4f036', 'PostingTruckCompanyId': 133041, 'PostGuid': 'b11b3081-ad00-b3d0-adc2-a273e71f9c74', 'PostId': 1269401218, 'EquipmentType': 'FSD', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'MIST', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 46, 'OriginLat': 45.99, 'OriginLon': -123.33, 'DestCity': 'SONOMA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.3, 'DestLon': -122.48, 'Length': '0', 'Phone': '801-254-1000', 'CompanyName': 'V C LOGI', 'Entered': 'Thu, 04 Aug 2016 12:36:32 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 15217, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/30/2016', 'Weight': '47000', 'Payment': '1300', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 694, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '2a1159ae-4adf-eaed-ba5f-d17e6d8ed845', 'PostId': 1269353331, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'RANDLE', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 78, 'OriginLat': 46.52, 'OriginLon': -121.94, 'DestCity': 'UKIAH', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 39.14, 'DestLon': -123.19, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Wed, 03 Aug 2016 22:15:44 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 103, 'PickUpDate': '8/9/2016', 'Weight': '0', 'Payment': '1150', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 593, 'TruckCoGuid': 'fdde9cdf-690d-0db4-610f-e1c1c13550f5', 'PostingTruckCompanyId': 87103, 'PostGuid': 'b950a665-cd56-2d2b-76f9-1bfaf9197312', 'PostId': 1269017691, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CLACKAMAS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 13, 'OriginLat': 45.38, 'OriginLon': -122.49, 'DestCity': 'RANCHO CORDOVA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.59, 'DestLon': -121.28, 'Length': '0', 'Phone': '916-485-2303', 'CompanyName': 'FREIGHT ', 'Entered': 'Wed, 03 Aug 2016 19:57:37 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1529789, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 103, 'PickUpDate': '8/11/2016', 'Weight': '0', 'Payment': '1150', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 593, 'TruckCoGuid': 'fdde9cdf-690d-0db4-610f-e1c1c13550f5', 'PostingTruckCompanyId': 87103, 'PostGuid': '583f40c4-26a9-3748-d765-f7c332e99fff', 'PostId': 1269251246, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CLACKAMAS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 13, 'OriginLat': 45.38, 'OriginLon': -122.49, 'DestCity': 'RANCHO CORDOVA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.59, 'DestLon': -121.28, 'Length': '0', 'Phone': '916-485-2303', 'CompanyName': 'FREIGHT ', 'Entered': 'Wed, 03 Aug 2016 19:57:25 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1529789, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 103, 'PickUpDate': '8/10/2016', 'Weight': '0', 'Payment': '1150', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 593, 'TruckCoGuid': 'fdde9cdf-690d-0db4-610f-e1c1c13550f5', 'PostingTruckCompanyId': 87103, 'PostGuid': '49a3212a-40d7-cce9-8264-e1199acf737f', 'PostId': 1269251245, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CLACKAMAS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 13, 'OriginLat': 45.38, 'OriginLon': -122.49, 'DestCity': 'RANCHO CORDOVA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.59, 'DestLon': -121.28, 'Length': '0', 'Phone': '916-485-2303', 'CompanyName': 'FREIGHT ', 'Entered': 'Wed, 03 Aug 2016 19:57:17 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1529789, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 103, 'PickUpDate': '8/12/2016', 'Weight': '0', 'Payment': '1150', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 593, 'TruckCoGuid': 'fdde9cdf-690d-0db4-610f-e1c1c13550f5', 'PostingTruckCompanyId': 87103, 'PostGuid': '8a86434f-5141-4d56-76f8-eaf7542a8679', 'PostId': 1269251247, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CLACKAMAS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 13, 'OriginLat': 45.38, 'OriginLon': -122.49, 'DestCity': 'RANCHO CORDOVA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.59, 'DestLon': -121.28, 'Length': '0', 'Phone': '916-485-2303', 'CompanyName': 'FREIGHT ', 'Entered': 'Wed, 03 Aug 2016 19:57:10 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1529789, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 103, 'PickUpDate': '8/8/2016', 'Weight': '0', 'Payment': '1150', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 593, 'TruckCoGuid': 'fdde9cdf-690d-0db4-610f-e1c1c13550f5', 'PostingTruckCompanyId': 87103, 'PostGuid': '0df68f02-20f9-0134-f265-04b408647f9d', 'PostId': 1269251248, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'CLACKAMAS', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 13, 'OriginLat': 45.38, 'OriginLon': -122.49, 'DestCity': 'RANCHO CORDOVA', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.59, 'DestLon': -121.28, 'Length': '0', 'Phone': '916-485-2303', 'CompanyName': 'FREIGHT ', 'Entered': 'Wed, 03 Aug 2016 19:57:02 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1529789, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '125', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 48, 'TruckCoGuid': 'b712d289-1779-1412-dd68-892e42a233e6', 'PostingTruckCompanyId': 315639, 'PostGuid': 'd782bc94-8ef9-ddb5-7229-17feab3eb088', 'PostId': 1269322840, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'LONGVIEW', 'OriginState': 'WA', 'OriginCtry': '', 'OriginDist': 45, 'OriginLat': 46.14, 'OriginLon': -122.9, 'DestCity': 'PORTLAND', 'DestState': 'OR', 'DestCtry': '', 'DestDist': 0, 'DestLat': 45.51, 'DestLon': -122.67, 'Length': '0', 'Phone': '215-309-7640', 'CompanyName': 'PLS LOGI', 'Entered': 'Wed, 03 Aug 2016 19:38:34 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1698127, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 502, 'PickUpDate': '8/8/2016', 'Weight': '48000', 'Payment': '', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 704, 'TruckCoGuid': '2a07a4b9-6282-3a15-a179-fae77c77de02', 'PostingTruckCompanyId': 276007, 'PostGuid': '1efc608b-2203-3910-099d-5bdbdaaeafed', 'PostId': 1269058216, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'TUALATIN', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 10, 'OriginLat': 45.37, 'OriginLon': -122.75, 'DestCity': 'WATSONVILLE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 36.92, 'DestLon': -121.76, 'Length': '', 'Phone': '575-420-8967', 'CompanyName': 'J H ROSE', 'Entered': 'Tue, 02 Aug 2016 19:41:30 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 611070, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/31/2016', 'Weight': '47000', 'Payment': '1000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 615, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': 'e190b5aa-0535-17e6-ee32-da318919e1b3', 'PostId': 1268945156, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'MARTINEZ', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38, 'DestLon': -122.12, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Tue, 02 Aug 2016 15:15:03 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/30/2016', 'Weight': '47000', 'Payment': '1000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 615, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '64d5f0f6-cb49-fa90-5caf-3d0101c2b5d4', 'PostId': 1268945157, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'MARTINEZ', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38, 'DestLon': -122.12, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Tue, 02 Aug 2016 15:15:03 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '12/31/1999', 'Weight': '47000', 'Payment': '1000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 688, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '6ce37120-c0eb-33d6-4791-690b69b0c0e8', 'PostId': 1268644459, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'TILLAMOOK', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.44, 'OriginLon': -123.83, 'DestCity': 'OAKDALE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 37.81, 'DestLon': -120.9, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Mon, 01 Aug 2016 22:15:44 GMT', 'IsDaily': true, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/21/2016', 'Weight': '47000', 'Payment': '950', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 615, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '246edf1e-95e5-1f1b-72a8-62be4582b0a3', 'PostId': 1268779713, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'MARTINEZ', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38, 'DestLon': -122.12, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Mon, 01 Aug 2016 20:27:34 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/20/2016', 'Weight': '47000', 'Payment': '1500', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 961, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '084afe41-1bc2-c190-7637-1b8b79fa482c', 'PostId': 1268779712, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'LOS ANGELES', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.06, 'DestLon': -118.3, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Mon, 01 Aug 2016 20:25:35 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/19/2016', 'Weight': '47000', 'Payment': '1500', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 961, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '4d970ecc-26cc-6bd3-dbe7-85d18cb99cb9', 'PostId': 1268779711, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'LOS ANGELES', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.06, 'DestLon': -118.3, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Mon, 01 Aug 2016 20:25:35 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/18/2016', 'Weight': '47000', 'Payment': '1500', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 961, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '4416b2fb-a8a0-3599-84ea-74dd5cce8b20', 'PostId': 1268779710, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'LOS ANGELES', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.06, 'DestLon': -118.3, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Mon, 01 Aug 2016 20:25:35 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/17/2016', 'Weight': '47000', 'Payment': '1500', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 961, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '2d6b37e0-685a-938e-6dd4-67a6de332fe0', 'PostId': 1268779709, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'LOS ANGELES', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.06, 'DestLon': -118.3, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Mon, 01 Aug 2016 20:25:35 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '8/16/2016', 'Weight': '47000', 'Payment': '1500', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 961, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '8d983b3b-ff29-1503-4d14-5ed942da2ac9', 'PostId': 1268345179, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'PORTLAND', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 0, 'OriginLat': 45.51, 'OriginLon': -122.67, 'DestCity': 'LOS ANGELES', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.06, 'DestLon': -118.3, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Mon, 01 Aug 2016 20:25:35 GMT', 'IsDaily': false, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '12/31/1999', 'Weight': '47000', 'Payment': '1000', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 609, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': '11983d6e-5e3a-d495-7c88-3e7ec687befe', 'PostId': 1268645158, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'TILLAMOOK', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.44, 'OriginLon': -123.83, 'DestCity': 'SACRAMENTO', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 38.58, 'DestLon': -121.48, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Mon, 01 Aug 2016 15:08:24 GMT', 'IsDaily': true, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '12/31/1999', 'Weight': '47000', 'Payment': '1400', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 966, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': 'd0b859b2-50fa-1524-3d70-2b3857ce48aa', 'PostId': 1268357736, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'TURNER', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 52, 'OriginLat': 44.79, 'OriginLon': -122.94, 'DestCity': 'COLTON', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 34.03, 'DestLon': -117.31, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Sun, 31 Jul 2016 23:57:27 GMT', 'IsDaily': true, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false },
            { 'Bond': 9999, 'PickUpDate': '12/31/1999', 'Weight': '47000', 'Payment': '1600', 'D2P': 'INFO', 'Exp': 'INFO', 'Fuel': 'INFO', 'Miles': 1049, 'TruckCoGuid': '635d11ff-e711-8b50-8d79-eda1c79d08a5', 'PostingTruckCompanyId': 338202, 'PostGuid': 'f23bd302-a136-d444-cd34-48684e3ca28a', 'PostId': 1268358528, 'EquipmentType': 'F', 'EquipmentId': 0, 'LoadSize': 2, 'OriginCity': 'TILLAMOOK', 'OriginState': 'OR', 'OriginCtry': '', 'OriginDist': 56, 'OriginLat': 45.44, 'OriginLon': -123.83, 'DestCity': 'RIVERSIDE', 'DestState': 'CA', 'DestCtry': '', 'DestDist': 0, 'DestLat': 33.94, 'DestLon': -117.41, 'Length': '0', 'Phone': '205-957-3525', 'CompanyName': 'ALL AROU', 'Entered': 'Sun, 31 Jul 2016 23:55:05 GMT', 'IsDaily': true, 'ResultType': 1, 'IsHeatMapSearch': false, 'PostingHandleId': 1681622, 'CanMakeOffer': true, 'HasLoadPay': false }
        ])
    ;
})();

(function() {
    'use strict';

    angular
        .module('solo.mocks')
        .constant('driverLoadsMock', {
            oneCurrentLoad: [{
                id: 12,
                origin: { deadhead: 51, date: '8/8/2016', city: 'Lyons', state: 'Or', country: '' },
                destination: { city: 'Denver', state: 'Co', country: ''},
                equipment: 'F',
                weight: 48000,
                payment: '',
                miles: 1234,
                trailerLength: 48,
                postedDate: 'Sun, 07 Aug 2016 23:03:02 GMT',
                type: 2,
                company: { name: 'LOGISTIC', phone: '254-213-6700' },
                status: 'booked', // TODO: need to add this property on backend
            }, {
                id: 14,
                origin: { deadhead: 51, date: '8/8/2016', city: 'Lyons', state: 'Or', country: '' },
                destination: { city: 'Denver', state: 'Co', country: ''},
                equipment: 'F',
                weight: 48000,
                payment: '',
                miles: 1234,
                trailerLength: 48,
                postedDate: 'Sun, 07 Aug 2016 23:03:02 GMT',
                type: 2,
                company: { name: 'LOGISTIC', phone: '254-213-6700' },
                rate: 1423.23, // TODO: need to add this property on backend
                status: 'pendingBol', // TODO: need to add this property on backend
                rateConfirmation: ['https://firebasestorage.googleapis.com/v0/b/test-c41f7.appspot.com/o/test2.pdf?alt=media&token=2e61246c-46c1-460a-a451-91be54819fde']
            }],
        });
})();

(function() {
    'use strict';

    angular
        .module('solo.mocks')
        .constant('driverMock', {
            id: 12,
            firstName: 'Armando',
            lastName: 'Perez',
            email: 'armandopmj@gmail.com'
        })
    ;
})();

(function() {
    'use strict';

    angular.module('solo')
        .filter('orderHistory', orderHistory);

    function orderHistory() {
        return function(loads) {
            return loads.sort(function (a, b) {
              // uploadedBol before verifiedBol before other statuses, secondarily order by timeUpdated.
              var aPriority = a.status === 'uploadedBol' ? 2 : a.status === 'verifiedBol' ? 1 : 0;
              var bPriority = b.status === 'uploadedBol' ? 2 : b.status === 'verifiedBol' ? 1 : 0;
              return bPriority - aPriority || new Date(b.timeUpdated) - new Date(a.timeUpdated);
            });
        };
    }
})();

(function() {
    'use strict';

    angular.module('solo')
        .filter('orderByStatus', orderByStatus);

    function orderByStatus() {
        return function(loads) {
            return loads.sort(byStatus);
        };
    }

    var statusOrder = ['booked', 'droppedOff', 'arrivedAtDestination', 'pickedUp', 'arrivedAtOrigin', 'signedRc'];

    function byStatus (load1, load2) {
      return statusOrder.indexOf(load1 && load1.status) - statusOrder.indexOf(load2 && load2.status);
    }
})();

(function() {
    'use strict';

    angular.module('solo')
        .filter('soloCurrency', currency);

    function currency($filter) {
        return function(value) {
            var res = $filter('currency')(value);
            if (value < 0) {
                res = res.replace('(', '-').replace(')', '');
            }
            return res;
        };
    }
})();

(function() {
    'use strict';

    angular.module('solo')
        .filter('soloCapitalize', capitalize);

    function capitalize() {
        return function(s) {
            return _.capitalize(s);
        };
    }
})();

(function() {
    'use strict';

    angular.module('solo')
        .directive('soloKeyboardAttach', soloKeyboardAttach);

    function soloKeyboardAttach($timeout) {
        return {
            link: function(scope, element) {
                ionic.on('native.keyboardshow', onShow, window);
                ionic.on('native.keyboardhide', onHide, window);

                //deprecated
                ionic.on('native.showkeyboard', onShow, window);
                ionic.on('native.hidekeyboard', onHide, window);


                var scrollCtrl, timer;

                function onShow(e) {
                    if (ionic.Platform.isAndroid() && !ionic.Platform.isFullScreen) {
                        return;
                    }
                    cancelTimer();
                    timer = $timeout(function() {
                        attachElementToKeyboard(e);
                    }, 100);
                }

                function onHide() {
                    if (ionic.Platform.isAndroid() && !ionic.Platform.isFullScreen) {
                        return;
                    }
                    cancelTimer();
                    timer = $timeout(function() {
                        resetElement();
                    });
                }

                function attachElementToKeyboard(e) {
                    var keyboardHeight = e.keyboardHeight || (e.detail && e.detail.keyboardHeight);
                    element.css('bottom', keyboardHeight + 'px');
                    scrollCtrl = element.controller('$ionicScroll');
                    if (scrollCtrl) {
                        scrollCtrl.scrollView.__container.style.bottom = keyboardHeight + element[0].clientHeight + 'px';
                    }
                }

                function resetElement() {
                    element.css('bottom', '');
                    if (scrollCtrl) {
                        scrollCtrl.scrollView.__container.style.bottom = '';
                    }
                }

                function cancelTimer() {
                    if (timer) {
                        $timeout.cancel(timer);
                    }
                }

                scope.$on('$destroy', function() {
                    ionic.off('native.keyboardshow', onShow, window);
                    ionic.off('native.keyboardhide', onHide, window);

                    //deprecated
                    ionic.off('native.showkeyboard', onShow, window);
                    ionic.off('native.hidekeyboard', onHide, window);
                });
            }
        };
    }
})();

(function() {
    'use strict';

    angular.module('solo')
        .directive('soloAutofocus', soloAutofocus);

    function soloAutofocus($rootScope, $timeout) {
        return {
            link: function($scope, $element, $attrs) {

                _activate();

                function _activate() {
                    var autofocus = !$attrs.soloAutofocus || $scope.$eval($attrs.soloAutofocus);
                    if (autofocus) {
                        _autofocus();
                    }
                }

                function _autofocus() {
                    $timeout(function() {
                        $element[0].focus();
                    }, 300);
                }
            }
        };
    }
})();

(function() {
    'use strict';

    angular
        .module('solo')
        .constant('statesCollection', [
            {
                abbreviation: 'AL',
                name: 'Alabama',
            },
            // {
            //     abbreviation: 'AK',
            //     name: 'Alaska',
            // },
            {
                abbreviation: 'AZ',
                name: 'Arizona',
            },
            {
                abbreviation: 'AR',
                name: 'Arkansas',
            },
            {
                abbreviation: 'CA',
                name: 'California',
            },
            {
                abbreviation: 'CO',
                name: 'Colorado',
            },
            {
                abbreviation: 'CT',
                name: 'Connecticut',
            },
            {
                abbreviation: 'DC',
                name: 'Washington DC',
            },
            {
                abbreviation: 'DE',
                name: 'Delaware',
            },
            {
                abbreviation: 'FL',
                name: 'Florida',
            },
            {
                abbreviation: 'GA',
                name: 'Georgia',
            },
            // {
            //     abbreviation: 'HI',
            //     name: 'Hawaii',
            // },
            {
                abbreviation: 'ID',
                name: 'Idaho',
            },
            {
                abbreviation: 'IL',
                name: 'Illinois',
            },
            {
                abbreviation: 'IN',
                name: 'Indiana',
            },
            {
                abbreviation: 'IA',
                name: 'Iowa',
            },
            {
                abbreviation: 'KS',
                name: 'Kansas',
            },
            {
                abbreviation: 'KY',
                name: 'Kentucky',
            },
            {
                abbreviation: 'LA',
                name: 'Louisiana',
            },
            {
                abbreviation: 'ME',
                name: 'Maine',
            },
            {
                abbreviation: 'MD',
                name: 'Maryland',
            },
            {
                abbreviation: 'MA',
                name: 'Massachusetts',
            },
            {
                abbreviation: 'MI',
                name: 'Michigan',
            },
            {
                abbreviation: 'MN',
                name: 'Minnesota',
            },
            {
                abbreviation: 'MS',
                name: 'Mississippi',
            },
            {
                abbreviation: 'MO',
                name: 'Missouri',
            },
            {
                abbreviation: 'MT',
                name: 'Montana',
            },
            {
                abbreviation: 'NE',
                name: 'Nebraska',
            },
            {
                abbreviation: 'NV',
                name: 'Nevada',
            },
            {
                abbreviation: 'NH',
                name: 'New Hampshire',
            },
            {
                abbreviation: 'NJ',
                name: 'New Jersey',
            },
            {
                abbreviation: 'NM',
                name: 'New Mexico',
            },
            {
                abbreviation: 'NY',
                name: 'New York',
            },
            {
                abbreviation: 'NC',
                name: 'North Carolina',
            },
            {
                abbreviation: 'ND',
                name: 'North Dakota',
            },
            {
                abbreviation: 'OH',
                name: 'Ohio',
            },
            {
                abbreviation: 'OK',
                name: 'Oklahoma',
            },
            {
                abbreviation: 'OR',
                name: 'Oregon',
            },
            {
                abbreviation: 'PA',
                name: 'Pennsylvania',
            },
            {
                abbreviation: 'RI',
                name: 'Rhode Island',
            },
            {
                abbreviation: 'SC',
                name: 'South Carolina',
            },
            {
                abbreviation: 'SD',
                name: 'South Dakota',
            },
            {
                abbreviation: 'TN',
                name: 'Tennessee',
            },
            {
                abbreviation: 'TX',
                name: 'Texas',
            },
            {
                abbreviation: 'UT',
                name: 'Utah',
            },
            {
                abbreviation: 'VT',
                name: 'Vermont',
            },
            {
                abbreviation: 'VA',
                name: 'Virginia',
            },
            {
                abbreviation: 'WA',
                name: 'Washington',
            },
            {
                abbreviation: 'WV',
                name: 'West Virginia',
            },
            {
                abbreviation: 'WI',
                name: 'Wisconsin',
            },
            {
                abbreviation: 'WY',
                name: 'Wyoming',
            }
        ])
    ;

})();

(function() {
    'use strict';

    angular
        .module('solo')
        .constant('milesCollection', [
            5,
            10,
            15,
            25,
            50,
            75,
            100,
            125,
            150,
            200,
            250,
            300,
            350,
            400,
            500
        ]);
})();

(function() {
    'use strict';

    angular
        .module('solo')
        .constant('loadTypesCollection', {
            any: {name: 'Any', value: 'any'},
            full: {name: 'Full', value: 'full'},
            partial: {name: 'Partial', value: 'partial'}
        });
})();

(function() {
    'use strict';

    angular
        .module('solo.loads')
        .constant('equipmentTypesCollection', [
            {
                name: 'Van',
                value: 'van',
                isActive: true,
            },
            {
                name: 'Flatbed',
                value: 'flat',
                isActive: false,
            },
            {
                name: 'Step Deck',
                value: 'stepdeck',
                isActive: false,
            },
            {
                name: 'Reefer',
                value: 'reefer',
                isActive: false,
            }
        ]);

})();

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

(function() {
    'use strict';

    angular
        .module('solo')
        .config(config);

    function config($stateProvider, $urlRouterProvider) {
        $stateProvider
            .state('top', {
                abstract: true,
                template: '<ion-nav-view></ion-nav-view>'
            })
            .state('top.loading', {
                url: '/loading',
                templateUrl: 'main/states/loading/loading.html'
            })
            .state('top.warning-message', {
                url: '/warning',
                templateUrl: 'main/states/warning/warning.html',
                controller: 'WarningCtrl',
                controllerAs: 'vm',
                resolve: {
                    warning: function(Warnings) {
                        return Warnings.one().get();
                    }
                }
            });

        $urlRouterProvider.otherwise('/loading');
    }
})();

(function() {
    'use strict';

    angular
        .module('solo')
        .config(config)
        .run(runBlock);

    function config(Config, $ionicConfigProvider, $httpProvider, RestangularProvider) {
        // set API URL
        var apiUrl = Config.ENV.SERVER_URL + '/api';
        var apiVersion = Config.ENV.API_VERSION ? ('/' + Config.ENV.API_VERSION) : '';
        RestangularProvider.setBaseUrl(apiUrl + apiVersion);

        $ionicConfigProvider.backButton.text('').previousTitleText(false);

        $httpProvider.interceptors.push('authHeaderService');
    }

    function runBlock(Config, $rootScope, $state, $stateParams, $ionicPlatform, $ionicViewSwitcher, $cordovaStatusbar, $timeout, $log, routingService, authService) {
    // function runBlock(Config, $rootScope, $state, $stateParams, $ionicPlatform, $ionicViewSwitcher, $cordovaStatusbar, $timeout, $log, snapshotDeployService, routingService, authService) {
        // It's very handy to add references to $state and $stateParams to the $rootScope
        // so that you can access them from any scope within your applications.For example,
        // <li ng-class="{ active: $state.includes('contacts.list') }"> will set the <li>
        // to active whenever 'contacts.list' or one of its descendants is active.
        console.log('test deploy');
        $rootScope.$state = $state;
        $rootScope.$stateParams = $stateParams;
        $rootScope.goBack = routingService.goBack;

        $log.log(Config.ENV.VERSION);
        $ionicPlatform.ready(function() {
            authService.tryReconnect();
            // snapshotDeployService.applySnapShotIfAvailable();
            // set status bar color to black, translucent
            if (window.StatusBar) { // eslint-disable-line
                $cordovaStatusbar.overlaysWebView(true);
                $cordovaStatusbar.style(0);
                $cordovaStatusbar.show();
            }
        });

        $ionicPlatform.on('resume', function() {
            authService.tryReconnect();
            $timeout(function() {
                // snapshotDeployService.applySnapShotIfAvailable();
                routingService.refreshState();
            });
        });
    }
})();
