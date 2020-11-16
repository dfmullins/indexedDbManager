var indexedDbManager = {
    /**
     * Initialize a specific data store
     * @param dbName
     */
    init: function (dbName) {
        if (false === this.validateDb(dbName)) {
            this.messages.renderMessage(this.messages.dbBadConfiguration);

            return false;
        }

        window.indexedDB      = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
        window.IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.msIDBTransaction;
        window.IDBKeyRange    = window.IDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange;
        if(!window.indexedDB){
            this.messages.renderMessage(this.messages.dbIncompatible);

            return false;
        } else {
            var request = window.indexedDB.open(dbName, Number(this.dataStores[dbName].version));

            request.onerror = function(){
                window.indexedDB.deleteDatabase(dbName);
                indexedDbManager.messages.renderMessage(
                    indexedDbManager.messages.dbInitError
                );
            };

            request.onupgradeneeded = function(event) {
                // Delete the older version of database if not version 0 and newer version exists
                if (Number(event.oldVersion) > 0
                    && (
                        Number(event.oldVersion) !== Number(indexedDbManager.dataStores[dbName].version)
                    )
                ) {
                    window.indexedDB.deleteDatabase(dbName);
                } else {
                    var db = request.result;
                    var store = db.createObjectStore(
                        indexedDbManager.dataStores[dbName].storeName,
                        indexedDbManager.dataStores[dbName].optionalParameters
                    );

                    if (indexedDbManager.dataStores[dbName].hasOwnProperty("indexes")
                        && indexedDbManager.dataStores[dbName].indexes.length > 0
                    ) {
                        $.each(indexedDbManager.dataStores[dbName].indexes, function (key, array) {
                            if (true === indexedDbManager.validIndexConfiguration(array)) {
                                var indexName          = array[0];
                                var keyPath            = array[1];
                                var optionalParameters = (typeof array[2] !== "undefined")
                                    ? array[2]
                                    : {};

                                store.createIndex(
                                    indexName,
                                    keyPath,
                                    optionalParameters
                                );
                            }
                        });
                    }
                }
            };

            return request;
        }
    },

    /**
     * @param openDb
     * @param dbName
     */
    dbResources: function (openDb, dbName) {
        var db    = openDb.result;
        var tx    = db.transaction(indexedDbManager.dataStores[dbName].storeName, "readwrite");
        var store = tx.objectStore(indexedDbManager.dataStores[dbName].storeName);

        return {
            "db": db,
            "tx": tx,
            "store": store
        };
    },
    
    /**
     * Remove the entire database from the browser
     * @param dbName
     * @param callbackFunction
     * @param callbackParameters
     */
    destroyDatabase: function (dbName, callbackFunction, callbackParameters) {
        window.indexedDB.deleteDatabase(dbName);
        if (typeof callbackFunction === "function") {
            callbackFunction(callbackParameters);
        }
    },
    
    /**
     * Returns records based on a keyword search
     * @param dbName
     * @param keyword
     * @param keyForSearch
     * @param callbackFunction
     * @param callbackParameters
     */
    getRecordsByWildcardSearch: function (dbName, keyword, keyForSearch, callbackFunction, callbackParameters) {
        if ("" === keyword || "" === keyForSearch) {
            this.messages.renderMessage(this.messages.wildcardSearchParameterFailure);
            
            return false;
        }
        
        var open = this.init(dbName);
        open.onsuccess = function() {
            var resources    = indexedDbManager.dbResources(open, dbName);
            var records      = [];
            var getAll       = resources.store.openCursor(null, "next");
            getAll.onsuccess = function(event) {
                var cursor = event.target.result;
                if (cursor) {
                    if (true === cursor.value.hasOwnProperty(keyForSearch)
                        && -1 !== cursor.value[keyForSearch].indexOf(keyword)
                    ) {
                        records.push(cursor.value);
                    }
                    cursor.continue();
                } else {
                    if (typeof callbackFunction === "function") {
                        callbackFunction(records, callbackParameters);
                    }

                    return false;
                }
            };
            indexedDbManager.storageTransactionComplete(resources);
        };
    },

    /**
     * Returns all records from a specific data store
     * @param dbName
     * @param direction
     * @param callbackFunction
     * @param callbackParameters
     */
    getAllRecords: function (dbName, direction, callbackFunction, callbackParameters) {
        var directionOptions = [
            "next", // ascending
            "nextunique",
            "prev", // descending
            "prevunique"
        ];

        if (-1 === directionOptions.indexOf(direction)) {
            direction = "next";
        }

        var open = this.init(dbName);
        open.onsuccess = function() {
            var resources    = indexedDbManager.dbResources(open, dbName);
            var records      = [];
            var getAll       = resources.store.openCursor(null, direction);
            getAll.onsuccess = function(event) {
                var cursor = event.target.result;
                if (cursor) {
                    records.push(cursor.value);
                    cursor.continue();
                } else {
                    if (typeof callbackFunction === "function") {
                        callbackFunction(records, callbackParameters);
                    }

                    return false;
                }
            };
            indexedDbManager.storageTransactionComplete(resources);
        };
    },

    /**
     * Get a record by an index value
     * @param dbName
     * @param indexName
     * @param searchValue
     * @param callbackFunction
     * @param callbackParameters
     */
    getRecordByIndex: function (dbName, indexName, searchValue, callbackFunction, callbackParameters) {
        var open = this.init(dbName);
        open.onsuccess = function() {
            var resources       = indexedDbManager.dbResources(open, dbName);
            var index           = resources.store.index(indexName);
            var getRecord       = index.get(searchValue);
            getRecord.onsuccess = function(event) {
                if (typeof callbackFunction === "function") {
                    callbackFunction(event.target, callbackParameters);

                    return false;
                }
            };
            indexedDbManager.storageTransactionComplete(resources);
        };
    },

    /**
     * Get a record by the key path, such as auto increment value
     * @param dbName
     * @param key
     * @param callbackFunction
     * @param callbackParameters
     */
    getRecordByKeypath: function (dbName, key, callbackFunction, callbackParameters) {
        var open = this.init(dbName);
        open.onsuccess = function() {
            var range        = IDBKeyRange.bound(key, key, false, false);
            var resources    = indexedDbManager.dbResources(open, dbName);
            var getAll       = resources.store.openCursor(range);
            getAll.onsuccess = function(event) {
                var cursor = event.target.result;
                if (cursor) {
                    if (typeof callbackFunction === "function") {
                        callbackFunction(cursor, callbackParameters);

                        return false;
                    }
                }
            };
            indexedDbManager.storageTransactionComplete(resources);
        };
    },
    
    /**
     * Get records by a key path range, such as from all records with keypath greater than 10
     * @param dbName
     * @param start
     * @param end
     * @param excludeStart
     * @param excludeEnd
     * @param callbackFunction
     * @param callbackParameters
     */
    getRecordsByKeypathRange: function (dbName, start, end, excludeStart, excludeEnd, callbackFunction, callbackParameters) {
        var boolValidation = [
            true,
            false
        ];
        
        if ("" === start 
            || "" === end 
            || -1 === boolValidation.indexOf(excludeStart) 
            || -1 === boolValidation.indexOf(excludeEnd)
        ) {
            this.messages.renderMessage(this.messages.rangeParameterFailure);
            
            return false;
        }
        
        var open = this.init(dbName);
        open.onsuccess = function() {
            var recordsArray = [];
            var range        = IDBKeyRange.bound(start, end, excludeStart, excludeEnd);
            var resources    = indexedDbManager.dbResources(open, dbName);
            var getAll       = resources.store.openCursor(range);
            getAll.onsuccess = function(event) {
                var cursor = event.target.result;
                if (cursor) {
                        recordsArray.push(cursor.value);
                        cursor.continue();
                } else {
                    if (typeof callbackFunction === "function") {
                        callbackFunction(recordsArray, callbackParameters);
                    }

                    return false;
                }
            };
            indexedDbManager.storageTransactionComplete(resources);
        };
    },

    /**
     * Update a record
     * @param dbName
     * @param oldData
     * @param newData
     * @param callbackFunction
     * @param callbackParameters
     */
    updateRecord: function (dbName, oldData, newData, callbackFunction, callbackParameters) {
        var open = this.init(dbName);
        open.onsuccess = function() {
            var resources    = indexedDbManager.dbResources(open, dbName);
            var getAll       = resources.store.openCursor(null);
            getAll.onsuccess = function(event) {
                var cursor = event.target.result;
                if (cursor) {
                    if (JSON.stringify(cursor.value) === JSON.stringify(oldData)) {
                        var request = cursor.update(newData);
                        request.onsuccess = function () {
                            if (typeof callbackFunction === "function") {
                                callbackFunction(cursor, callbackParameters);
                            }

                            return false;
                        };
                    } else {
                        cursor.continue();
                    }
                }
            };
            indexedDbManager.storageTransactionComplete(resources);
        };
    },

    /**
     * Get a count of all records in a database
     * @param dbName
     * @param callbackFunction
     * @param callbackParameters
     */
    countAllRecords: function (dbName, callbackFunction, callbackParameters) {
        var open = this.init(dbName);
        open.onsuccess = function() {
            var resources = indexedDbManager.dbResources(open, dbName);
            var request   = resources.store.count();
            request.onsuccess = function() {
                var count = request.result;
                if (typeof callbackFunction === "function") {
                    callbackFunction(count, callbackParameters);
                }

                return false;
            };
        };
    },

    /**
     * Get the first record
     * @param dbName
     * @param callbackFunction
     * @param callbackParameters
     */
    getFirstRecord: function (dbName, callbackFunction, callbackParameters) {
        var open = this.init(dbName);
        open.onsuccess = function() {
            var resources = indexedDbManager.dbResources(open, dbName);
            var request   = resources.store.openCursor(null, "next");
            request.onsuccess = function (event) {
                var cursor = event.target.result;
                var retVal = false;
                if (cursor) {
                    retVal = cursor;
                }

                if (typeof callbackFunction === "function") {
                    callbackFunction(retVal, callbackParameters);
                }

                return false;
            };
            indexedDbManager.storageTransactionComplete(resources);
        };
    },

    /**
     * Get the last record
     * @param dbName
     * @param callbackFunction
     * @param callbackParameters
     */
    getLastRecord: function (dbName, callbackFunction, callbackParameters) {
        var open = this.init(dbName);
        open.onsuccess = function() {
            var resources = indexedDbManager.dbResources(open, dbName);
            var request   = resources.store.openCursor(null, "prev");
            request.onsuccess = function (event) {
                var cursor = event.target.result;
                var retVal = false;
                if (cursor) {
                    retVal = cursor;
                }

                if (typeof callbackFunction === "function") {
                    callbackFunction(retVal, callbackParameters);
                }

                return false;
            };
            indexedDbManager.storageTransactionComplete(resources);
        };
    },

    /**
     * Delete all records in a specific data store
     * @param dbName
     * @param callbackFunction
     * @param callbackParameters
     */
    deleteAllRecords: function(dbName, callbackFunction, callbackParameters) {
        var open = this.init(dbName);
        open.onsuccess = function() {
            var resources   = indexedDbManager.dbResources(open, dbName);
            var request     = resources.store.clear();
            request.onerror = function(event) {
                this.messages.renderMessage(this.messages.deleteAllUnsuccessful);
            };

            request.onsuccess = function(event) {
                if (typeof callbackFunction === "function") {
                    callbackFunction(callbackParameters);
                }

                return false;
            };
            indexedDbManager.storageTransactionComplete(resources);
        };
    },

    /**
     * Delete a record by its key in a specific data store
     * @param dbName
     * @param key
     * @param callbackFunction
     * @param callbackParameters
     */
    deleteRecordByKey: function(dbName, key, callbackFunction, callbackParameters) {
        var open = this.init(dbName);
        open.onsuccess = function() {
            var resources = indexedDbManager.dbResources(open, dbName);
            var request   = resources.store.delete(key);
            request.onsuccess = function(event) {
                if (typeof callbackFunction === "function") {
                    callbackFunction(callbackParameters);
                }

                return false;
            };

            request.onerror = function(event) {
                this.messages.renderMessage(this.messages.deleteAllUnsuccessful);
            };
            indexedDbManager.storageTransactionComplete(resources);
        };
    },

    /**
     * Save data to the specific store
     * @param dbName
     * @param data
     * @param callbackFunction
     * @param callbackParameters
     * @param showErrorMsg
     * @returns {boolean}
     */
    saveRecord: function(dbName, data, callbackFunction, callbackParameters, showErrorMsg) {
        if (typeof data !== "object") {
            this.messages.renderMessage(this.messages.isNotObject);

            return false;
        }

        var open = this.init(dbName);
        open.onsuccess = function() {
            var resources = indexedDbManager.dbResources(open, dbName);
            var request   = resources.store.add(data);
            request.onsuccess = function(event) {
                if (typeof callbackFunction === "function") {
                    callbackFunction(callbackParameters);
                }

                return false;
            };
            indexedDbManager.storageTransactionComplete(resources);
        };

        open.onerror = function() {
            if (true === showErrorMsg) {
                indexedDbManager.messages.renderMessage(message);

                return false;
            }
        };
    },

    /**
     * Close data store after every transactions
     */
    storageTransactionComplete: function(resources){
        resources.tx.oncomplete = function() {
            resources.db.close();
        };
    },

    /**
     * Assure indexes are valid
     */
    validIndexConfiguration: function (array) {
        var isValid = false;

        if (typeof array[0] !== 'undefined'
            && typeof array[1] !== 'undefined'
            && "" !== array[0]
            && "" !== array[1]
        ) {
            isValid = true;
        }

        return isValid;
    },

    /**
     * Validate data store configuration
     * @param dbName
     * @returns {boolean}
     */
    validateDb: function (dbName) {
        var valid = true;
        var validateArray = [
            "version",
            "storeName",
            "optionalParameters"
        ];

        if (false === indexedDbManager.dataStores.hasOwnProperty(dbName)) {
            valid = false;
        }

        $.each(validateArray, function(index, value) {
            if (false === indexedDbManager.dataStores[dbName].hasOwnProperty(value)) {
                valid = false;
            }
        });

        if (isNaN(Number(this.dataStores[dbName].version))) {
            valid = false;
        }

        if (typeof this.dataStores[dbName].optionalParameters !== "object") {
            valid = false;
        }

        return valid;
    }
};

/**
 * User messages
 */
indexedDbManager.messages = {
    dbInitError: "IndexedDb error: Database could not initialize. Please refresh your page.",
    dbIncompatible: "IndexedDb error: Your browser is incompatible with indexedDb.  Please use another browser.",
    dbBadConfiguration: "IndexedDb error: Bad database configuration.",
    isNotFunction: "IndexedDb error: A function is a required as a variable type.",
    isNotObject: "IndexedDb error: An object is a required as a variable type.",
    saveUnsuccessful: "IndexedDb error: Save was unsuccessful.",
    deleteAllUnsuccessful: "IndexedDb error: Delete all was unsuccessful.",
    rangeParameterFailure: "IndexedDb error: There was an error in the range parameters when getting records by a keypath range.",
    wildcardSearchParameterFailure: "IndexedDb error: Either a keyword or key to search was empty.",

    /**
     * Render message
     * @param msg
     * @param code
     */
    renderMessage: function (msg) {
        alert(msg); // Change this to any other way of rendering messages
    }
};

/**
 * Data store configurations
 */
indexedDbManager.dataStores = {
    /**
     * All data stores are listed here
     * The format is as follows:
     *
     * "databaseName": {
     *     "version": integer,
     *     "storeName": anyName,
     *     "optionalParameters": {
     *         keyPath: A key used in your records,
     *         autoIncrement: true or false
     *     },
     *     "indexes": [
     *         ["indexName", "indexKeyPath", {unique: false}], ...
     *     ]
     * }
     *
     * Things to note:
     *
     * 1. In your indexes, the indexName and indexKeyPath can be the same, but the indexKeyPath
     * must be a keyPath in your records
     *
     * 2. Add indexes in order to search records easier
     *
     * 3. It's best to save a record or data store row with the following format:
     * {"keypath1": data, "keypath2": data, "keypath3": data, ...}.  Using this format
     * will allow you to have clear indexes for searching in keypath(s)
     *
     * 4. All databases start with version 0.  Whenever you change the configuration of your
     * database, like in changing an index or adding indexes, you'll need to update your version
     * number.  Version numbers can only be positive whole numbers.
     *
     * 5. When there is a version change, the indexDbManager will remove the old database
     * and then rebuild the new database.  Any data in the old database will be deleted.
     *
     */

    // Data store that holds click data
    "exampleOneDb": {
        "version": 1, //required version (int)
        "storeName": "objectStore", //required database name (string)
        "optionalParameters": {keyPath: "id", autoIncrement: true}, //can be {} or keypath name with options
        "indexes": [
            ["dateTime", "dateTime", {unique: false}],
            ["record", "record", {unique: false}]
        ]
    }
};
