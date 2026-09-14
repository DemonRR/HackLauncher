export namespace main {

	export class LogEntry {
	    timestamp: string;
	    level: string;
	    message: string;

	    static createFrom(source: any = {}) {
	        return new LogEntry(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.timestamp = source["timestamp"];
	        this.level = source["level"];
	        this.message = source["message"];
	    }
	}
	export class RuntimeToolRequest {
	    name: string;
	    targetPath: string;
	    runtimeArgs: string;
	    programArgs: string;
	    workingDirectory: string;
	    javaEnvironmentId: string;
	    runInTerminal: boolean;

	    static createFrom(source: any = {}) {
	        return new RuntimeToolRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.targetPath = source["targetPath"];
	        this.runtimeArgs = source["runtimeArgs"];
	        this.programArgs = source["programArgs"];
	        this.workingDirectory = source["workingDirectory"];
	        this.javaEnvironmentId = source["javaEnvironmentId"];
	        this.runInTerminal = source["runInTerminal"];
	    }
	}
	export class RuntimeToolResult {
	    message: string;
	    pid: number;
	    runtimePath: string;
	    runtimeVersion?: number;
	    requiredVersion?: number;

	    static createFrom(source: any = {}) {
	        return new RuntimeToolResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.message = source["message"];
	        this.pid = source["pid"];
	        this.runtimePath = source["runtimePath"];
	        this.runtimeVersion = source["runtimeVersion"];
	        this.requiredVersion = source["requiredVersion"];
	    }
	}

}
