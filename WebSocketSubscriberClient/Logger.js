class Logger {
	static LogLevels = {
		Log: 0,
		Error: 1,
		Warning: 2,
		Info: 3,
		Debug: 4,
	}

	static logLevel = this.LogLevels.Info;
	static logCallback = null;

	constructor() {}

	static setLogLevel(logLevel) {
		this.logLevel = logLevel;
	}

	static getLogLevel() {
		return this.logLevel;
	}

	static setLogCallback(logCallback) {
		this.logCallback = logCallback;
	}

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

	static _log(logLevel, str) {
		if (this.logLevel < logLevel) {
			return;
		}

		var msg = this._formatDateTimeStr() + ": " + str;

		var logMessageClass = "log";
		
		if (logLevel == this.LogLevels.Log) {
			console.log(msg);
			logMessageClass = "log";
		} else if (logLevel == this.LogLevels.Error) {
			console.error(msg);
			logMessageClass = "error";
		} else if (logLevel == this.LogLevels.Warning) {
			console.warn(msg);
			logMessageClass = "warning";
		} else if (logLevel == this.LogLevels.Info) {
			console.info(msg);
			logMessageClass = "info";
		} else if (logLevel == this.LogLevels.Debug) {
			console.debug(msg);
			logMessageClass = "debug";
		} else {
			console.log(msg);
			logMessageClass = "log";
		}
		
		if (this.logCallback) {
			this.logCallback(logMessageClass, msg);
		}
	}

	static log(str) {
		this._log(this.LogLevels.Log, str);
	}

	static error(str) {
		this._log(this.LogLevels.Error, str);
	}

	static warn(str) {
		this._log(this.LogLevels.Warning, str);
	}

	static info(str) {
		this._log(this.LogLevels.Info, str);
	}

	static debug(str) {
		this._log(this.LogLevels.Debug, str);
	}
}
