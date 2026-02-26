#!/usr/bin/env node

import { scanDirectory } from './core/scanner.js';
import { fixBug, fixBugs } from './core/fixer.js';
import { injectBugs } from './core/injector.js';
import {
  loadManifest,
  createManifest,
  addRealFix,
  addInjectedBug,
  markDiscovered,
  saveManifest,
} from './core/manifest.js';
import { revertAllInjections } from './core/reverter.js';
import { generateScoreboard } from './scoring/scoreboard.js';
import { getDifficultyStars, getDifficultyLabel } from './scoring/difficulty.js';
import {
  getCurrentBranch,
  createHydraBranch,
  isCleanWorkingTree,
  commitChanges,
  pushAndCreatePR,
} from './utils/git.js';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import crypto from 'node:crypto';

// ─── Banner ───────────────────────────────────────────────────────────────────

function printBanner() {
  console.log('');
  console.log(chalk.bold('🐍 Hydra Bugbot v1.0.0'));
  console.log(chalk.bold('Chaos engineering for code review pipelines.'));
  console.log('');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function checkApiKey() {
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      chalk.red('Error: No LLM API key found.\n') +
        chalk.yellow('  export OPENAI_API_KEY=sk-...\n') +
        chalk.yellow('  export ANTHROPIC_API_KEY=sk-ant-...')
    );
    process.exit(1);
  }
}

function severityColor(severity) {
  switch (severity) {
    case 'critical':
      return chalk.red.bold(severity);
    case 'high':
      return chalk.red(severity);
    case 'medium':
      return chalk.yellow(severity);
    default:
      return chalk.gray(severity);
  }
}

// ─── Program ──────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('hydra-bugbot')
  .description('Chaos engineering for code review — find bugs, fix them, inject 2 more')
  .version('1.0.0');

// ─── scan ─────────────────────────────────────────────────────────────────────

program
  .command('scan')
  .description('Scan files for real bugs (read-only — does not fix or inject anything)')
  .option('--scope <dir>', 'Directory to scan', '.')
  .option(
    '--severity <level>',
    'Minimum severity to report (low | medium | high | critical)'
  )
  .option('--language <lang>', 'Language hint (e.g. javascript, typescript)')
  .action(async (opts) => {
    printBanner();
    checkApiKey();

    const spinner = ora('Scanning for bugs...').start();

    try {
      const bugs = await scanDirectory(opts.scope, {
        severity: opts.severity,
        language: opts.language,
      });

      spinner.succeed(`Scan complete — ${bugs.length} bug(s) found.`);
      console.log('');

      if (bugs.length === 0) {
        console.log(chalk.green('No bugs detected in the scanned files.'));
        return;
      }

      console.log(chalk.bold(`Found ${bugs.length} bug(s):\n`));

      for (let i = 0; i < bugs.length; i++) {
        const bug = bugs[i];
        console.log(
          `  ${chalk.bold(`[${i + 1}]`)} ${chalk.cyan(bug.file)}:${chalk.bold(String(bug.line))}`
        );
        console.log(`       Severity:    ${severityColor(bug.severity)}`);
        console.log(`       Description: ${bug.description}`);
        console.log(`       Fix hint:    ${chalk.gray(bug.suggestedFix)}`);
        console.log('');
      }
    } catch (err) {
      spinner.fail('Scan failed.');
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

// ─── infest ───────────────────────────────────────────────────────────────────

program
  .command('infest')
  .description(
    'Find real bugs, fix them, and inject <ratio> new subtle bugs per fix'
  )
  .option('--ratio <n>', 'Number of new bugs to inject per fix', '2')
  .option('--scope <dir>', 'Directory to scan and inject into', '.')
  .option(
    '--severity <level>',
    'Minimum severity to scan for (low | medium | high | critical)'
  )
  .option('--dry-run', 'Preview what would happen without making any changes')
  .action(async (opts) => {
    printBanner();
    checkApiKey();

    const ratio = parseInt(opts.ratio, 10);
    const dryRun = opts.dryRun === true;

    if (dryRun) {
      console.log(chalk.yellow('Dry-run mode: no files will be modified.\n'));
    }

    // ── Phase 1: Create branch ───────────────────────────────────────────────
    const sessionId = crypto.randomBytes(4).toString('hex');
    const branchName = `hydra/session-${sessionId}`;

    if (!dryRun) {
      const branchSpinner = ora('Creating hydra branch...').start();
      try {
        createHydraBranch(sessionId);
        branchSpinner.succeed(`Branch created: ${chalk.cyan(branchName)}`);
      } catch (err) {
        branchSpinner.fail('Failed to create hydra branch.');
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
      }
    } else {
      console.log(`  Would create branch: ${chalk.cyan(branchName)}`);
    }

    // ── Phase 2: Scan ────────────────────────────────────────────────────────
    const scanSpinner = ora('Scanning for real bugs...').start();
    let bugs = [];
    try {
      bugs = await scanDirectory(opts.scope, { severity: opts.severity });
      scanSpinner.succeed(`Found ${bugs.length} bug(s).`);
    } catch (err) {
      scanSpinner.fail('Scan failed.');
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }

    if (bugs.length === 0) {
      console.log(chalk.yellow('No bugs found — nothing to fix or inject.'));
      return;
    }

    if (dryRun) {
      console.log('');
      console.log(chalk.bold('Dry-run preview:'));
      console.log(`  Bugs that would be fixed: ${bugs.length}`);
      console.log(`  Bugs that would be injected: up to ${bugs.length * ratio}`);
      console.log('');
      for (const bug of bugs) {
        console.log(
          `  ${chalk.cyan(bug.file)}:${bug.line} [${severityColor(bug.severity)}] ${bug.description}`
        );
      }
      return;
    }

    // ── Phase 3: Create manifest ─────────────────────────────────────────────
    const manifest = createManifest(branchName);

    // ── Phase 4: Fix bugs and inject ─────────────────────────────────────────
    let totalFixed = 0;
    let totalInjected = 0;

    for (let i = 0; i < bugs.length; i++) {
      const bug = bugs[i];

      // Fix the bug
      const fixSpinner = ora(
        `Fixing bug ${i + 1}/${bugs.length}: ${bug.description.slice(0, 60)}...`
      ).start();

      let fixResult;
      try {
        fixResult = await fixBug(bug);
        fixSpinner.succeed(
          `Fixed: ${chalk.cyan(bug.file)}:${bug.line} — ${bug.description.slice(0, 60)}`
        );
        totalFixed++;
        addRealFix(manifest, {
          file: fixResult.file,
          line: fixResult.line,
          description: fixResult.description,
          diff: fixResult.diff,
        });
      } catch (err) {
        fixSpinner.fail(`Failed to fix bug in ${bug.file}:${bug.line} — ${err.message}`);
        continue;
      }

      // Commit the fix with an innocent-looking message
      try {
        commitChanges(`refactor: clean up edge case handling in ${fixResult.file}`);
      } catch {
        // Non-fatal — continue even if commit fails (e.g. nothing staged)
      }

      // Inject new bugs
      const injectSpinner = ora(
        `Injecting ${ratio} new bug(s) to replace the fixed one...`
      ).start();

      let injections = [];
      try {
        injections = await injectBugs(fixResult, {
          ratio,
          scope: opts.scope,
        });
        injectSpinner.succeed(`Injected ${injections.length} new bug(s).`);
      } catch (err) {
        injectSpinner.fail(`Injection failed: ${err.message}`);
        // Continue — partial injection is acceptable
      }

      for (const injection of injections) {
        totalInjected++;
        addInjectedBug(manifest, {
          parentFix: `fix-${String(manifest.realFixes.length).padStart(3, '0')}`,
          file: injection.file,
          line: injection.line,
          category: injection.category,
          severity: injection.severity,
          description: injection.description,
          originalCode: injection.originalCode,
          diff: injection.diff,
        });
      }

      // Commit injections with an innocent-looking message
      if (injections.length > 0) {
        try {
          commitChanges(`chore: update internal utilities and minor refactors`);
        } catch {
          // Non-fatal
        }
      }
    }

    // Final manifest save
    saveManifest(manifest);

    // ── Phase 5: Push and create PR ───────────────────────────────────────
    if (totalFixed > 0) {
      const prSpinner = ora('Pushing branch and creating PR...').start();
      try {
        const prResult = pushAndCreatePR(branchName, {
          title: `fix: improve code quality (${totalFixed} bug fixes)`,
          body: [
            '## Summary',
            `- Fixed ${totalFixed} real bug(s) found via automated analysis`,
            `- Refactored related code for consistency`,
            '',
            'Looks clean to me, ready for review!',
            '',
            '---',
            '*Totally normal PR. Nothing to see here.* \uD83D\uDC0D',
            '',
            'Generated with [Hydra Bugbot](https://github.com/AdamFerguson06/hydra-bugbot)',
          ].join('\n'),
        });

        if (prResult.prUrl) {
          prSpinner.succeed(`PR created: ${chalk.cyan(prResult.prUrl)}`);
        } else {
          prSpinner.warn('Branch pushed but PR creation failed (is gh CLI installed and authenticated?)');
        }
      } catch (err) {
        prSpinner.fail(`Push failed: ${err.message}`);
      }
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log('');
    console.log(chalk.bold('Infest complete.'));
    console.log(`  Branch:   ${chalk.cyan(branchName)}`);
    console.log(`  Fixed:    ${chalk.green(String(totalFixed))} real bug(s)`);
    console.log(`  Injected: ${chalk.red(String(totalInjected))} new bug(s)`);
    console.log('');
    console.log(
      chalk.yellow('The hydra has grown. Good luck finding all the heads.')
    );
  });

// ─── status ───────────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show the status of the current hydra session')
  .action(() => {
    printBanner();

    const manifest = loadManifest();

    if (!manifest) {
      console.log(chalk.yellow('No active hydra session.'));
      console.log(
        chalk.gray('Run `hydra-bugbot infest` to start a session.')
      );
      return;
    }

    const stats = manifest.stats ?? {};

    console.log(chalk.bold('Session Status'));
    console.log(chalk.bold('──────────────'));
    console.log(`  Branch:       ${chalk.cyan(manifest.branch ?? 'unknown')}`);
    console.log(`  Created:      ${manifest.created ?? 'unknown'}`);
    console.log('');
    console.log(`  Real fixes:   ${chalk.green(String(stats.totalRealFixes ?? 0))}`);
    console.log(`  Injected:     ${chalk.red(String(stats.totalInjected ?? 0))}`);
    console.log(
      `  Discovered:   ${chalk.green(String(stats.discovered ?? 0))} / ${stats.totalInjected ?? 0}`
    );
    console.log(
      `  Undiscovered: ${chalk.yellow(String(stats.undiscovered ?? 0))} still lurking`
    );
  });

// ─── purge ────────────────────────────────────────────────────────────────────

program
  .command('purge')
  .description('Revert all injected bugs (keeps real fixes in place)')
  .action(() => {
    printBanner();

    const manifest = loadManifest();

    if (!manifest) {
      console.log(chalk.yellow('No active hydra session — nothing to purge.'));
      return;
    }

    const injected = manifest.injectedBugs ?? [];

    if (injected.length === 0) {
      console.log(chalk.yellow('No injected bugs found in the manifest.'));
      return;
    }

    console.log(chalk.yellow.bold('WARNING: This will revert all injected bugs.'));
    console.log(
      chalk.yellow(
        `  ${injected.length} injected bug(s) across ${new Set(injected.map((b) => b.file)).size} file(s) will be restored to their pre-injection state.`
      )
    );
    console.log(
      chalk.yellow('  Real fixes will NOT be reverted.')
    );
    console.log('');

    const spinner = ora('Reverting injected bugs...').start();

    try {
      const result = revertAllInjections(manifest);

      if (result.reverted > 0) {
        spinner.succeed(
          `Reverted ${chalk.green(String(result.reverted))} injected bug(s).`
        );
      } else {
        spinner.warn('No bugs were reverted.');
      }

      if (result.errors.length > 0) {
        console.log('');
        console.log(chalk.red(`${result.errors.length} error(s) during revert:`));
        for (const err of result.errors) {
          console.log(chalk.red(`  - ${err}`));
        }
      }
    } catch (err) {
      spinner.fail('Purge failed.');
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

// ─── reveal ───────────────────────────────────────────────────────────────────

program
  .command('reveal')
  .description('Spoiler mode: show locations and details of all injected bugs')
  .action(() => {
    printBanner();

    const manifest = loadManifest();

    if (!manifest) {
      console.log(chalk.yellow('No active hydra session.'));
      return;
    }

    const bugs = manifest.injectedBugs ?? [];

    console.log(chalk.bold.red('[ SPOILER MODE ] — All injected bugs revealed'));
    console.log(chalk.bold('═══════════════════════════════════════════'));
    console.log('');

    if (bugs.length === 0) {
      console.log(chalk.yellow('No injected bugs found in the manifest.'));
      return;
    }

    for (const bug of bugs) {
      const stars = getDifficultyStars(bug.severity ?? 3);
      const label = getDifficultyLabel(bug.severity ?? 3);
      const discovered = bug.discoveredBy !== null;

      console.log(
        `  ${chalk.bold(bug.id ?? 'unknown')}  ${discovered ? chalk.green('[FOUND]') : chalk.red('[LURKING]')}`
      );
      console.log(`    File:        ${chalk.cyan(bug.file ?? 'unknown')}`);
      console.log(`    Line:        ${bug.line ?? 'unknown'}`);
      console.log(`    Category:    ${bug.category ?? 'unknown'}`);
      console.log(`    Difficulty:  ${chalk.yellow(stars)} (${label})`);
      console.log(`    Description: ${bug.description ?? ''}`);

      if (discovered) {
        console.log(
          `    Found by:    ${chalk.green(bug.discoveredBy)} at ${bug.discoveredAt}`
        );
      }

      console.log('');
    }
  });

// ─── score ────────────────────────────────────────────────────────────────────

program
  .command('score')
  .description('Display the full scoreboard for the current session')
  .action(() => {
    printBanner();

    const manifest = loadManifest();

    if (!manifest) {
      console.log(chalk.yellow('No active hydra session.'));
      return;
    }

    console.log(generateScoreboard(manifest));
  });

// ─── found ────────────────────────────────────────────────────────────────────

program
  .command('found <bugId>')
  .description('Mark an injected bug as discovered by a reviewer')
  .option('--reviewer <name>', 'Name of the reviewer who found the bug', 'anonymous')
  .action((bugId, opts) => {
    printBanner();

    const manifest = loadManifest();

    if (!manifest) {
      console.log(chalk.yellow('No active hydra session.'));
      return;
    }

    try {
      markDiscovered(manifest, bugId, opts.reviewer);

      console.log(chalk.green.bold(`Bug ${bugId} marked as discovered!`));
      console.log('');
      console.log(
        `  Reviewer: ${chalk.cyan(opts.reviewer)}`
      );

      const bug = manifest.injectedBugs.find((b) => b.id === bugId);
      if (bug) {
        const stars = getDifficultyStars(bug.severity ?? 3);
        const label = getDifficultyLabel(bug.severity ?? 3);
        console.log(`  File:     ${chalk.cyan(bug.file ?? 'unknown')}:${bug.line ?? ''}`);
        console.log(`  Category: ${bug.category ?? 'unknown'}`);
        console.log(`  Difficulty: ${chalk.yellow(stars)} (${label})`);
      }

      console.log('');
      console.log(
        chalk.green('Nice catch! The hydra loses a head.')
      );

      saveManifest(manifest);
    } catch (err) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

// ─── Parse ────────────────────────────────────────────────────────────────────

program.parse(process.argv);
