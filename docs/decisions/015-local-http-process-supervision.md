# ADR-015: observed local fixture HTTP process termination

Status: Accepted reversible local engineering default.
Date: 2026-09-18.

Extend the [ADR-014](014-http-terminal-authority.md) accounting protocol with an actual fixed child process for the synthetic profile. It performs one `/robots.txt` GET through explicitly trusted loopback fixture transport. A `.example` logical URL is not a public collection grant. No arbitrary executable, script, environment, production credentials, public DNS or external destination is accepted. This is trusted-code process separation for fixture testing, not an OS sandbox or independent production egress enforcement.

The parent reserves capacity, launches the fixed worker paused, commits the supervisor binding and rechecks live reservation gates before GO. The worker never starts collection without GO and exits on lost input or bounded startup timeout. An existing immutable binding prevents a second process from starting the same invocation. A conflict only terminates the new paused child, never settles the original invocation.

The parent observes actual process termination and closed pipes before recording a terminal witness. Successful signal delivery alone is insufficient; Node distinguishes it from termination. See the [official Node24 child-process documentation](https://github.com/nodejs/node/blob/v24.x/doc/api/child_process.md). The fixed worker creates no subprocesses or untrusted JavaScript execution; observing its exit establishes termination of its own local sockets, not a general process-tree or production container guarantee. Tests additionally observe fixture-server connection closure.

Report decoded accounting bytes as unknown unless measured across the entire transport; retained body length is not that measurement. Preserve worst-case charges. Return only bounded fixture observation metadata; this unit accepts no Evidence or PageSnapshot and installs no live dispatcher or released SEO procedure. Unconfirmed termination or unavailable database acceptance leaves the reservation held. Do not fabricate timestamps, successful cleanup, receipts or recovery after host loss.
