import {ZodError} from 'zod'

/** Runs a command and turns any failure into one readable line and exit code 1 */
export async function runCli(main: () => Promise<void>): Promise<void> {
  try {
    await main()
  } catch (error) {
    if (error instanceof ZodError) {
      console.error('Invalid configuration:')
      for (const issue of error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`)
    } else {
      console.error(error instanceof Error ? error.message : error)
    }
    process.exitCode = 1
  }
}
