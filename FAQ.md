# Frequently Asked Questions (FAQ)

<details>
<summary><strong>What are the best models for bolt.gives?</strong></summary>

For the best experience with bolt.gives, we recommend using the following models:

- **Claude 3.5 Sonnet (old)**: Best overall coder, providing excellent results across all use cases
- **Gemini 2.0 Flash**: Exceptional speed while maintaining good performance
- **GPT-4o**: Strong alternative to Claude 3.5 Sonnet with comparable capabilities
- **DeepSeekCoder V2 236b**: Best open source model (available through OpenRouter, DeepSeek API, or self-hosted)
- **Qwen 2.5 Coder 32b**: Best model for self-hosting with reasonable hardware requirements

**Note**: Models with less than 7b parameters typically lack the capability to properly interact with bolt!

</details>

<details>
<summary><strong>How do I get the best results with bolt.gives?</strong></summary>

- **Be specific about your stack**:  
  Mention the frameworks or libraries you want to use (e.g., Astro, Tailwind, ShadCN) in your initial prompt. This ensures that bolt.gives scaffolds the project according to your preferences.

- **Use the enhance prompt icon**:  
  Before sending your prompt, click the _enhance_ icon to let the AI refine your prompt. You can edit the suggested improvements before submitting.

- **Scaffold the basics first, then add features**:  
  Ensure the foundational structure of your application is in place before introducing advanced functionality. This helps bolt.gives establish a solid base to build on.

- **Batch simple instructions**:  
 Combine simple tasks into a single prompt to save time and reduce API credit consumption. For example:  
 _"Change the color scheme, add mobile responsiveness, and restart the dev server."_
</details>

<details>
<summary><strong>How do I contribute to bolt.gives?</strong></summary>

Check out our [Contribution Guide](CONTRIBUTING.md) for more details on how to get involved!

</details>

<details>
<summary><strong>What are the future plans for bolt.gives?</strong></summary>

Visit our [Roadmap](https://roadmap.sh/r/ottodev-roadmap-2ovzo) for the latest updates.  
New features and improvements are on the way!

</details>

<details>
<summary><strong>Why are there so many open issues/pull requests?</strong></summary>

bolt.gives began as a small showcase project to explore editing open-source projects with local LLMs. However, it quickly grew into a massive community effort!

We're forming a team of maintainers to manage demand and streamline issue resolution. The maintainers are rockstars, and we're also exploring partnerships to help the project thrive.

</details>

<details>
<summary><strong>How do local LLMs compare to larger models like Claude 3.5 Sonnet for bolt.gives?</strong></summary>

While local LLMs are improving rapidly, larger models like GPT-4o, Claude 3.5 Sonnet, and DeepSeek Coder V2 236b still offer the best results for complex applications. Our ongoing focus is to improve prompts, agents, and the platform to better support smaller local LLMs.

</details>

<details>
<summary><strong>Common Errors and Troubleshooting</strong></summary>

### **What platforms are supported?**

- Using bolt.gives in a browser: supported on Windows, macOS, and Linux.
- Installing / self-hosting bolt.gives: supported on **Ubuntu 18.04+ only**.
  - Windows is **not supported** for installation/self-hosting (you can still use the hosted app from Windows).
  - macOS is **not supported** for installation/self-hosting (you can still use the hosted app from macOS).

### **"There was an error processing this request"**

This generic error message means something went wrong. Check both:

- The terminal (if you started the app with Docker or `pnpm`).
- The developer console in your browser (press `F12` or right-click > _Inspect_, then go to the _Console_ tab).

### **"x-api-key header missing"**

This error is sometimes resolved by restarting the Docker container.  
If that doesn't work, try switching from Docker to `pnpm` or vice versa. We're actively investigating this issue.

### **Blank preview when running the app**

A blank preview often occurs due to hallucinated bad code or incorrect commands.  
To troubleshoot:

- Check the developer console for errors.
- Remember, previews are core functionality, so the app isn't broken! We're working on making these errors more transparent.

### **"Everything works, but the results are bad"**

Local LLMs like Qwen-2.5-Coder are powerful for small applications but still experimental for larger projects. For better results, consider using larger models like GPT-4o, Claude 3.5 Sonnet, or DeepSeek Coder V2 236b.

</details>

---

Got more questions? Feel free to reach out or open an issue in our GitHub repo!
