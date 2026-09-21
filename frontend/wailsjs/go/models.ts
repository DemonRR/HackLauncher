export namespace main {
	
	export class ApplicationToolRequest {
	    name: string;
	    executable: string;
	    arguments: string;
	    workingDirectory: string;
	    runInTerminal: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ApplicationToolRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.executable = source["executable"];
	        this.arguments = source["arguments"];
	        this.workingDirectory = source["workingDirectory"];
	        this.runInTerminal = source["runInTerminal"];
	    }
	}
	export class ApplicationToolResult {
	    message: string;
	    pid: number;
	    elevated: boolean;
	    terminal: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ApplicationToolResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.message = source["message"];
	        this.pid = source["pid"];
	        this.elevated = source["elevated"];
	        this.terminal = source["terminal"];
	    }
	}
	export class AutoFixReport {
	    fixedItems: number;
	    changes: number;
	    remainingErrors: number;
	    remainingWarnings: number;
	    messages: string[];
	
	    static createFrom(source: any = {}) {
	        return new AutoFixReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.fixedItems = source["fixedItems"];
	        this.changes = source["changes"];
	        this.remainingErrors = source["remainingErrors"];
	        this.remainingWarnings = source["remainingWarnings"];
	        this.messages = source["messages"];
	    }
	}
	export class BackupInfo {
	    name: string;
	    createdAt: string;
	    size: number;
	    itemCount: number;
	
	    static createFrom(source: any = {}) {
	        return new BackupInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.createdAt = source["createdAt"];
	        this.size = source["size"];
	        this.itemCount = source["itemCount"];
	    }
	}
	export class ToolDiagnostic {
	    itemId: string;
	    name: string;
	    type: string;
	    status: string;
	    summary: string;
	    detail: string;
	    path: string;
	    code?: string;
	    autoFixable: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ToolDiagnostic(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.itemId = source["itemId"];
	        this.name = source["name"];
	        this.type = source["type"];
	        this.status = source["status"];
	        this.summary = source["summary"];
	        this.detail = source["detail"];
	        this.path = source["path"];
	        this.code = source["code"];
	        this.autoFixable = source["autoFixable"];
	    }
	}
	export class DiagnosticReport {
	    checkedAt: string;
	    total: number;
	    healthy: number;
	    warnings: number;
	    errors: number;
	    fixable: number;
	    results: ToolDiagnostic[];
	
	    static createFrom(source: any = {}) {
	        return new DiagnosticReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.checkedAt = source["checkedAt"];
	        this.total = source["total"];
	        this.healthy = source["healthy"];
	        this.warnings = source["warnings"];
	        this.errors = source["errors"];
	        this.fixable = source["fixable"];
	        this.results = this.convertValues(source["results"], ToolDiagnostic);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class LogEntry {
	    timestamp: string;
	    level: string;
	    message: string;
	    category?: string;
	    tool?: string;
	    toolType?: string;
	    status?: string;
	    detail?: string;
	
	    static createFrom(source: any = {}) {
	        return new LogEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.timestamp = source["timestamp"];
	        this.level = source["level"];
	        this.message = source["message"];
	        this.category = source["category"];
	        this.tool = source["tool"];
	        this.toolType = source["toolType"];
	        this.status = source["status"];
	        this.detail = source["detail"];
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
	export class StartupDiagnosticResult {
	    enabled: boolean;
	    report?: DiagnosticReport;
	
	    static createFrom(source: any = {}) {
	        return new StartupDiagnosticResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.report = this.convertValues(source["report"], DiagnosticReport);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

