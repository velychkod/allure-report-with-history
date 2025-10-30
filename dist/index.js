/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 396:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 444:
/***/ ((module) => {

module.exports = eval("require")("@actions/github");


/***/ }),

/***/ 7:
/***/ ((module) => {

module.exports = eval("require")("fs-extra");


/***/ }),

/***/ 317:
/***/ ((module) => {

"use strict";
module.exports = require("child_process");

/***/ }),

/***/ 857:
/***/ ((module) => {

"use strict";
module.exports = require("os");

/***/ }),

/***/ 928:
/***/ ((module) => {

"use strict";
module.exports = require("path");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
const core = __nccwpck_require__(396);
const github = __nccwpck_require__(444);
const fs = __nccwpck_require__(7);
const path = __nccwpck_require__(928);
const { execSync, execFileSync } = __nccwpck_require__(317);
const os = __nccwpck_require__(857);

const timestamp = formatTimestamp(new Date());
const allureResultsPath = core.getInput('allure-results-path', { required: true });
const deployBranch = core.getInput('deploy-branch', { required: true });
const reportsToKeep = parseInt(core.getInput('reports-to-keep') || '20', 10);
const generateIndexHtml = core.getInput('gen-index') !== 'false';
const ghPagesUrl = core.getInput('gh-pages-url') || '';
const gitUserName = core.getInput('git-user-name') || 'github-actions';
const gitUserEmail = core.getInput('git-user-email') || 'actions@github.com';
const reportName = core.getInput('report-name') || `Allure Report ${timestamp}`;;

const repo = github.context.repo.repo;
const owner = github.context.repo.owner;
const deployDir = path.join(process.cwd(), 'deploy-allure-reports');
const githubToken = process.env.GITHUB_TOKEN;

if (!githubToken) throw new Error('GITHUB_TOKEN not found in environment');

function formatTimestamp(date) {
    // Format: YYYY-MM-DD_HH-mm-ss
    const Y = date.getFullYear();
    const M = String(date.getMonth() + 1).padStart(2, '0');
    const D = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${Y}-${M}-${D}_${h}-${m}-${s}`;
}

function installAllure() {
    console.log('📊 Installing Allure...');
    if (os.platform() === 'win32') {
        execSync('choco install allure -y', { stdio: 'inherit' });
        return 'allure';
    } else {
        execSync('sudo apt-get update && sudo apt-get install -y wget unzip openjdk-11-jre', { stdio: 'inherit' });
        const tmpDir = path.join(os.tmpdir(), 'allure');
        fs.ensureDirSync(tmpDir);
        execSync(`wget -qO ${tmpDir}/allure.zip https://github.com/allure-framework/allure2/releases/download/2.35.1/allure-2.35.1.zip`, { stdio: 'inherit' });
        execSync(`unzip -q -o ${tmpDir}/allure.zip -d ${tmpDir}`, { stdio: 'inherit' });
        const allurePath = path.join(tmpDir, 'allure-2.35.1', 'bin', 'allure');
        execSync(`chmod +x ${allurePath}`);
        return allurePath;
    }
}

(async () => {
    try {
        console.log(`📈 Running on ${os.platform() === 'win32' ? 'Windows' : 'Linux/macOS'}`);

        const allureBinary = installAllure();
        console.log(`📊 Using Allure binary: ${allureBinary}`);

        // Prepare deploy dir
        fs.removeSync(deployDir);
        fs.ensureDirSync(deployDir);

        // Clone branch with previous reports (if branch exists)
        console.log(`📈 Cloning branch ${deployBranch}...`);
        try {
            const remote = githubToken
                ? `https://x-access-token:${githubToken}@github.com/${owner}/${repo}.git`
                : `https://github.com/${owner}/${repo}.git`;
            execSync(`git clone --single-branch --branch ${deployBranch} ${remote} ${deployDir}`, { stdio: 'inherit' });
        } catch (err) {
            console.log(`⚠ Branch ${deployBranch} not found or clone failed: ${err.message}`);
            console.log('⚠ Continuing with empty deploy directory (will create branch on push if necessary).');
            // ensure deployDir exists
            fs.ensureDirSync(deployDir);
            // initialize empty git repo so we can commit later
            execSync('git init', { cwd: deployDir, stdio: 'inherit' });
        }

        // Find existing reports matching timestamp pattern YYYY-MM-DD_HH-mm-ss
        const timeDirRegex = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/;
        const existingReports = fs.readdirSync(deployDir, { withFileTypes: true })
            .filter(d => d.isDirectory() && timeDirRegex.test(d.name))
            .sort((a, b) => b.name.localeCompare(a.name));

        const latestExisting = existingReports.length > 0 ? existingReports[0].name : null;

        // If there's a previous report, copy its 'history' into allure-results before generation
        if (latestExisting) {
            const historySrc = path.join(deployDir, latestExisting, 'history');
            const historyDst = path.join(allureResultsPath, 'history');
            if (fs.existsSync(historySrc)) {
                console.log(`📊 Copying history from previous report (${latestExisting}) to allure-results/history...`);
                fs.ensureDirSync(path.dirname(historyDst));
                fs.copySync(historySrc, historyDst, { overwrite: true });
            } else {
                console.log('⚠ No history folder found in the latest existing report.');
            }
        } else {
            console.log('⚠ No previous reports detected: history will not be available.');
        }

        // Create executor.json with metadata
        console.log('🧠 Creating executor.json for Allure metadata...');

        const executorData = {
            type: 'github',
            name: 'GitHub Actions',
            reportName: reportName,
            buildName: github.context.workflow,
            buildOrder: github.context.runNumber,
            buildUrl: `https://github.com/${owner}/${repo}/actions/runs/${github.context.runId}`  
        };

        const executorFilePath = path.join(allureResultsPath, 'executor.json');
        fs.writeFileSync(executorFilePath, JSON.stringify(executorData, null, 2));
        console.log(`✅ Created executor.json at ${executorFilePath}`);

        // Generate Allure report into a temp folder (do not --clean published deploy dir)
        console.log('📊 Generating Allure report...');
        const tempOut = path.join(process.cwd(), 'allure-report');

        // remove previous temp folder if exists
        fs.removeSync(tempOut);
        execFileSync(allureBinary, ['generate', allureResultsPath, '-o', tempOut], { stdio: 'inherit' });

        if (!fs.existsSync(tempOut)) throw new Error('Allure report generation failed.');
        console.log('🎉 Allure report generated successfully.');

        // Create timestamped folder and copy generated report into deployDir
        const newReportPath = path.join(deployDir, timestamp);
        fs.copySync(tempOut, newReportPath);
        console.log(`✅ Copied new report to ${newReportPath}`);

        // Build list of reports to keep: newest N (including new one)
        const allReportDirs = fs.readdirSync(deployDir, { withFileTypes: true })
            .filter(d => d.isDirectory() && timeDirRegex.test(d.name))
            .map(d => d.name)
            .concat() // copy
            .sort((a, b) => b.localeCompare(a)); // newest first

        // Ensure new timestamp is in the list (it may or may not exist in existing list)
        if (!allReportDirs.includes(timestamp)) {
            allReportDirs.unshift(timestamp);
        } else {
            // move timestamp to first position
            allReportDirs.splice(allReportDirs.indexOf(timestamp), 1);
            allReportDirs.unshift(timestamp);
        }

        const keep = allReportDirs.slice(0, reportsToKeep);

        // Remove all other directories except .git and index.html if present
        fs.readdirSync(deployDir).forEach(item => {
            if (item === '.git') return;
            if (!keep.includes(item) && fs.lstatSync(path.join(deployDir, item)).isDirectory()) {
                console.log(`📈 Removing old report folder: ${item}`);
                fs.removeSync(path.join(deployDir, item));
            }
        });

        // Generate index.html with links if requested
        if (generateIndexHtml) {
            console.log('📊 Generating index.html with history links...');
            const reportDirs = fs.readdirSync(deployDir, { withFileTypes: true })
                .filter(d => d.isDirectory() && timeDirRegex.test(d.name))
                .sort((a, b) => b.name.localeCompare(a.name));
            const links = reportDirs.map(d => `<li><a href="./${d.name}/index.html" target="_blank">${d.name}</a></li>`).join('\n');
            const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Allure Reports Archive</title>
<style>body{font-family:Arial;padding:20px}li{margin:.4rem 0}</style></head>
<body>
<h1>Allure Reports archive</h1>
<ul>
${links}
</ul>
</body>
</html>`;
            fs.writeFileSync(path.join(deployDir, 'index.html'), html, 'utf8');
            console.log('✅ index.html written.');
        }

        // Commit & push
        console.log('📈 Committing & pushing changes...');
        execSync(`git config user.name "${gitUserName}"`, { cwd: deployDir });
        execSync(`git config user.email "${gitUserEmail}"`, { cwd: deployDir });
        execSync('git add .', { cwd: deployDir });
        // commit may fail if nothing changed; swallow that case
        try {
            execSync(`git commit -m "Deployed Allure report run ${github.context.runId}"`, { cwd: deployDir, stdio: 'inherit' });
        } catch (err) {
            console.log('⚠ No changes to commit.');
        }

        // Choose remote for push
        let remoteUrl;
        if (githubToken) {
            remoteUrl = `https://x-access-token:${githubToken}@github.com/${owner}/${repo}.git`;
        } else {
            remoteUrl = `https://github.com/${owner}/${repo}.git`;
        }

        // Create branch if not exists locally
        try {
            execSync(`git rev-parse --verify origin/${deployBranch}`, { cwd: deployDir, stdio: 'ignore' });
        } catch {
            // remote branch might not exist; create orphan branch locally and push
            try {
                execSync(`git checkout --orphan ${deployBranch}`, { cwd: deployDir });
                execSync('git rm -rf .', { cwd: deployDir });
                execSync('git add .', { cwd: deployDir });
                execSync(`git commit -m "Initial commit for ${deployBranch}" || echo "no commit"`, { cwd: deployDir });
            } catch (e) {
                // ignore
            }
        }

        // Push
        execSync(`git push ${remoteUrl} HEAD:${deployBranch}`, { cwd: deployDir, stdio: 'inherit' });

        console.log('✅ Allure report deployed successfully.');

        // Add link to run summary if ghPagesUrl provided
        if (ghPagesUrl) {
            const reportUrl = `${ghPagesUrl.replace(/\/$/, '')}/${timestamp}/index.html`;
            try {
                const summaryPath = process.env.GITHUB_STEP_SUMMARY || path.join(process.cwd(), 'step_summary.txt');
                const summaryText = `### 📊 [Open Allure Report](${reportUrl})\n` +
                    `⏳ The report may take a few minutes to become available after publishing.\n`;
                fs.appendFileSync(summaryPath, summaryText);
                console.log(`📊 Added summary link: ${reportUrl}`);
            } catch (err) {
                console.log(`⚠ Unable to write to GITHUB_STEP_SUMMARY: ${err.message}`);
            }
        }

    } catch (error) {
        core.setFailed(error.message || String(error));
        console.error(error);
    }
})();

module.exports = __webpack_exports__;
/******/ })()
;