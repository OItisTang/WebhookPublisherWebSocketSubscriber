class Logger {
	static _LogLevelDefinitions = {
		Log: {
			logLevel: 0,
			name: "Log",
			logFunc: console.log,
		},
		Error: {
			logLevel: 1,
			name: "Error",
			logFunc: console.error,
		},
		Warning: {
			logLevel: 2,
			name: "Warning",
			logFunc: console.warn,
		},
		Info: {
			logLevel: 3,
			name: "Info",
			logFunc: console.info,
		},
		Debug: {
			logLevel: 4,
			name: "Debug",
			logFunc: console.debug,
		},
	}

	static _logLevel = this._LogLevelDefinitions.Info.logLevel;
	static _logCallback = null;

	// private methods -----------------------------------------------------------

	static _formatDateTimeStr() {
		var now = new Date();
		var dateStr =
			now.getFullYear()
			+ "-" + String(now.getMonth() + 1).padStart(2, '0')
			+ "-" + String(now.getDate()).padStart(2, '0')
			+ " "
			+ String(now.getHours()).padStart(2, '0')
			+ ":" + String(now.getMinutes()).padStart(2, '0')
			+ ":" + String(now.getSeconds()).padStart(2, '0');
		return dateStr;
	}

	static _getLogLevelDefinition(logLevel) {
		for (const defKey in this._LogLevelDefinitions) {
			var logLevelDefinition = this._LogLevelDefinitions[defKey];
			if (logLevelDefinition.logLevel == logLevel) {
				return logLevelDefinition;
			}
		}

		return this._LogLevelDefinitions.Log;
	}

	static _log(logLevel, str) {
		if (logLevel > this._logLevel) {
			return;
		}

		var msg = this._formatDateTimeStr() + ": " + str;

		var logLevelDefinition = this._getLogLevelDefinition(logLevel);

		logLevelDefinition.logFunc(msg);

		if (this._logCallback) {
			this._logCallback(logLevelDefinition.name, msg);
		}
	}

	// public APIs -----------------------------------------------------------

	static SetLogLevel(logLevel) {
		this._logLevel = logLevel;
	}

	static GetLogLevel() {
		return this._logLevel;
	}

	static SetLogCallback(logCallback) {
		this._logCallback = logCallback;
	}

	static GetLogLevelList() {
		var logLevelList = [];

		for (const defKey in this._LogLevelDefinitions) {
			var logLevelDefinition = this._LogLevelDefinitions[defKey];
			var logLevelObj = {};
			logLevelObj.logLevel = logLevelDefinition.logLevel;
			logLevelObj.name = logLevelDefinition.name;
			logLevelList.push(logLevelObj);
		}

		return logLevelList;
	}

	// log APIs -----------------------------------------------------------

	static log(str) {
		this._log(this._LogLevelDefinitions.Log.logLevel, str);
	}

	static error(str) {
		this._log(this._LogLevelDefinitions.Error.logLevel, str);
	}

	static warn(str) {
		this._log(this._LogLevelDefinitions.Warning.logLevel, str);
	}

	static info(str) {
		this._log(this._LogLevelDefinitions.Info.logLevel, str);
	}

	static debug(str) {
		this._log(this._LogLevelDefinitions.Debug.logLevel, str);
	}

	static console_debug(str) {
		if (this._logLevel >= this._LogLevelDefinitions.Debug.logLevel) {
			console.debug(str);
		}
	}
}
