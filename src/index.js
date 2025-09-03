const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs-extra');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const allureResultsPath = core.getInput('allure-results-source', { required: true });
const publishedBranch = core.getInput('published-reports-branch', { required: true });
const reportsToKeep = parseInt(core.getInput('reports-to-keep') || '20', 10);
const generateIndexHtmlWithHistory = core.getInput('generate-index-html-with-reports-history') !== 'false';
const ghPagesUrl = core.getInput('gh-pages-url');

const repo = github.context.repo.repo;
const owner = github.context.repo.owner;
const tempDir = path.join(process.cwd(), 'temp-allure-reports');

// Helper to log and flush immediately
function log(msg) {
    console.log(msg);
    process.stdout.write('');
}

(async () => {
    try {
        const isWindows = process.platform === 'win32';
        log(`Detecting OS...`);
        log(`Running on ${isWindows ? 'Windows' : 'Linux/macOS'}`);

        // Determine Allure binary path
        const allureBinary = path.join(__dirname, isWindows ? 'allure.bat' : 'allure');

        if (!fs.existsSync(allureBinary)) {
            throw new Error(`Allure binary not found at expected path: ${allureBinary}`);
        }

        log(`Using Allure binary: ${allureBinary}`);

        // Ensure Linux binary is executable
        if (!isWindows) {
            log(`Ensuring Linux binary is executable...`);
            execSync(`chmod +x "${allureBinary}"`, { stdio: 'inherit' });
        }

        // Generate Allure report
        log('Generating Allure report...');
        execFileSync(allureBinary, ['generate', allureResultsPath, '--clean', '-o', './allure-report'], {
            stdio: 'inherit',
        });

        if (!fs.existsSync('./allure-report')) {
            throw new Error('Allure report generation failed: ./allure-report directory not found.');
        }
        log('✅ Allure report generated successfully.');

        // Prepare deployment folder
        log(`Preparing deployment folder at ${tempDir}...`);
        fs.removeSync(tempDir);
        fs.mkdirSync(tempDir);
        fs.copySync('./allure-report', tempDir);

        // Preserve history
        if (reportsToKeep > 0) {
            log(`Cloning branch ${publishedBranch} to preserve history...`);
            const tempHistoryDir = `${tempDir}-history`;
            execSync(
                `git clone --single-branch --branch ${publishedBranch} https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/${owner}/${repo}.git ${tempHistoryDir}`,
                { stdio: 'inherit' }
            );

            const historyPath = path.join(tempHistoryDir, 'history');
            if (fs.existsSync(historyPath)) {
                fs.copySync(historyPath, path.join(tempDir, 'history'));
                log('Previous history restored.');
            }
        }

        // Archive previous reports
        if (reportsToKeep > 0) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const archivePath = path.join(tempDir, timestamp);
            fs.mkdirSync(archivePath, { recursive: true });
            fs.copySync('./allure-report', archivePath);
            log(`Archived current report to ${archivePath}`);

            const lastHistoryPath = path.join(tempDir, 'last-history');
            fs.mkdirSync(lastHistoryPath, { recursive: true });
            if (fs.existsSync(path.join('./allure-report', 'history'))) {
                fs.copySync(path.join('./allure-report', 'history'), lastHistoryPath);
            }
        }

        // Generate index.html
        if (generateIndexHtmlWithHistory) {
            log('Generating index.html with reports history...');
            const indexFile = path.join(tempDir, 'index.html');
            const reportDirs = fs
                .readdirSync(tempDir, { withFileTypes: true })
                .filter((dirent) => dirent.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/.test(dirent.name))
                .sort((a, b) => b.name.localeCompare(a.name));

            const links = reportDirs
                .map((d) => `<li><a href='./${d.name}/index.html' target='_blank'>Report from ${d.name}</a></li>`)
                .join('\n');

            const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset='UTF-8'>
<title>Allure Reports Archive</title>
<style>body { font-family: Arial, sans-serif; padding: 20px; } li { margin: 0.5rem 0; }</style>
</head>
<body>
<h1>Allure Reports Archive</h1>
<ul>
${links}
</ul>
</body>
</html>`;
            fs.writeFileSync(indexFile, html, 'utf8');
            log(`✅ index.html generated at ${indexFile}`);
        }

        // Deploy to branch
        log(`Deploying Allure report to branch ${publishedBranch}...`);
        execSync(`git init`, { cwd: tempDir, stdio: 'inherit' });
        execSync(`git config user.name "GitHub Actions"`, { cwd: tempDir, stdio: 'inherit' });
        execSync(`git config user.email "actions@github.com"`, { cwd: tempDir, stdio: 'inherit' });
        execSync(`git add .`, { cwd: tempDir, stdio: 'inherit' });
        execSync(`git commit -m "Deployed Allure report by run ${github.context.runId}"`, { cwd: tempDir, stdio: 'inherit' });
        execSync(
            `git push -f https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/${owner}/${repo}.git HEAD:${publishedBranch}`,
            { cwd: tempDir, stdio: 'inherit' }
        );
        log('✅ Allure report deployed.');

        // Add summary link
        if (ghPagesUrl) {
            const reportDirs = fs
                .readdirSync(tempDir, { withFileTypes: true })
                .filter((dirent) => dirent.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/.test(dirent.name))
                .sort((a, b) => b.name.localeCompare(a.name));

            if (reportDirs.length > 0) {
                const latestReport = reportDirs[0].name;
                const reportUrl = `${ghPagesUrl.replace(/\/$/, '')}/${latestReport}/index.html`;
                const summary = `### 📊 [Open Allure Report](${reportUrl})\nThe report will be available after deployment completes.`;
                fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
                log(`Added link to run summary: ${reportUrl}`);
            } else {
                log('No report folder found to link in run summary.');
            }
        }
    } catch (error) {
        core.setFailed(error.message);
        log(`❌ Error: ${error.message}`);
    }
})();
