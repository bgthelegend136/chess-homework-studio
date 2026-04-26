import { expect, test, type Page } from '@playwright/test';

type SeedResult = {
  assignmentTitle: string;
  studentName: string;
  tokenLink: string;
  acceptedMove: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function loginCoach(page: Page) {
  const email = requireEnv('E2E_COACH_EMAIL');
  const password = requireEnv('E2E_COACH_PASSWORD');

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function createAssignmentWithQuestion(page: Page, prefix: string): Promise<SeedResult> {
  const studentName = `${prefix}-student`;
  const assignmentTitle = `${prefix}-assignment`;
  const acceptedMove = 'Bb5';

  await page.goto('/students/new');
  await page.getByLabel('Name *').fill(studentName);
  await page.getByRole('button', { name: 'Create student' }).click();
  await expect(page).toHaveURL(/\/students$/);
  await expect(page.getByText(studentName)).toBeVisible();

  await page.goto('/assignments/new');
  await page.getByLabel('Title *').fill(assignmentTitle);
  await page.locator('#student').selectOption({ label: studentName });
  await page.getByRole('button', { name: 'Create & add questions' }).click();
  await expect(page).toHaveURL(/\/assignments\/.*\/edit$/);

  const pgn = '1. e4 e5 2. Nf3 Nc6';
  await page.getByLabel('PGN').fill(pgn);
  await page.getByRole('button', { name: 'Paste / re-parse' }).click();
  await expect(page.getByRole('button', { name: '+ Add question from this position' })).toBeVisible();

  await page.getByRole('button', { name: '+ Add question from this position' }).click();
  await page.getByLabel('Prompt for student').fill('Find the best move for White.');
  await page.getByLabel('Accepted move(s)').fill(acceptedMove);
  await page
    .getByLabel('Coach explanation / thinking')
    .fill('Develop the bishop and pressure the c6 knight.');
  await page.getByRole('button', { name: 'Calculation' }).click();
  await page.getByLabel('Calculation depth').selectOption('short');
  await page.getByRole('button', { name: 'Save question' }).click();
  await expect(page.getByText('Saved questions')).toBeVisible();

  const tokenLink = await page.locator('[data-testid="copy-student-link"]').getAttribute('data-student-link');
  if (!tokenLink) {
    throw new Error('Student token link was not found on assignment editor');
  }

  return {
    assignmentTitle,
    studentName,
    tokenLink,
    acceptedMove,
  };
}

test.describe('critical path smoke tests', () => {
  test('coach can create student, assignment, and question', async ({ browser }) => {
    const prefix = `e2e-${Date.now()}`;
    const coach = await browser.newContext();
    const coachPage = await coach.newPage();

    await loginCoach(coachPage);
    const seeded = await createAssignmentWithQuestion(coachPage, prefix);

    expect(seeded.tokenLink).toContain('/a/');
    expect(seeded.assignmentTitle).toContain(prefix);
    expect(seeded.studentName).toContain(prefix);

    await coach.close();
  });

  test('student checks answer, completes self-review, coach opens Answer Analysis', async ({
    browser,
  }) => {
    const prefix = `e2e-${Date.now()}`;

    const coachContext = await browser.newContext();
    const coachPage = await coachContext.newPage();
    await loginCoach(coachPage);
    const seeded = await createAssignmentWithQuestion(coachPage, prefix);

    const studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();
    await studentPage.goto(seeded.tokenLink);
    await expect(studentPage.getByText('Assignment from coach')).toBeVisible();

    const questionId = await studentPage
      .locator('[data-testid="current-question-meta"]')
      .getAttribute('data-question-id');
    if (!questionId) {
      throw new Error('Current question id was not available in student view');
    }

    const token = new URL(seeded.tokenLink).pathname.split('/').pop();
    if (!token) throw new Error('Could not parse student token from URL');

    await studentPage.evaluate(
      async ({ tokenValue, questionIdValue, move }) => {
        const res = await fetch(`/api/public/${tokenValue}/answers`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question_id: questionIdValue,
            student_move: move,
            explanation: 'Play actively and develop with tempo.',
          }),
        });
        if (!res.ok) {
          throw new Error('Could not seed student answer before check');
        }
      },
      { tokenValue: token, questionIdValue: questionId, move: seeded.acceptedMove },
    );

    await studentPage.reload();
    await studentPage.getByRole('button', { name: 'Check answer' }).click();
    await expect(studentPage.getByText('Correct')).toBeVisible();
    await studentPage.getByRole('button', { name: 'Complete self-review' }).click();
    await expect(studentPage.getByText('Completed. You can review your checked answers below.')).toBeVisible();

    await coachPage.goto('/dashboard');
    const assignmentRow = coachPage.locator('div', { hasText: seeded.assignmentTitle }).first();
    await expect(assignmentRow).toBeVisible();
    await assignmentRow.getByRole('link', { name: 'Answer Analysis' }).click();
    await expect(coachPage).toHaveURL(/\/assignments\/.*\/review$/);
    await expect(coachPage.getByText('Answer Analysis')).toBeVisible();
    await expect(coachPage.getByText(seeded.acceptedMove)).toBeVisible();

    await studentContext.close();
    await coachContext.close();
  });
});

