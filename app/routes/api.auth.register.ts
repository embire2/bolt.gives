import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { z } from 'zod';

const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
});

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const data = Object.fromEntries(formData);

    const validation = registerSchema.safeParse(data);

    if (!validation.success) {
      return json(
        {
          error: 'Validation failed',
          details: validation.error.issues.map((issue) => ({
            field: issue.path[0],
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }

    // For now, just return success - the actual registration will be handled client-side
    return json({
      success: true,
      message: 'User registration data validated',
      data: validation.data,
    });
  } catch (error) {
    console.error('Registration error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
