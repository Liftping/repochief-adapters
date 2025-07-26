# Contributing to @repochief/adapters

Thank you for your interest in contributing to the RepoChief Adapters project! This document provides guidelines and information for contributors.

## 🎯 How to Contribute

### Types of Contributions We Welcome

1. **🔌 New Adapters** - Add support for new AI tools
2. **🐛 Bug Fixes** - Fix issues in existing adapters
3. **📚 Documentation** - Improve guides and examples
4. **🧪 Tests** - Add test coverage for adapters
5. **✨ Features** - Enhance the core framework

### Priority Contributions

We especially need help with these adapters:

- **Claude Code Adapter** - Official Anthropic integration
- **Aider Adapter** - Paul Gauthier's popular AI coding assistant
- **Cursor Adapter** - Cursor IDE integration
- **Continue Adapter** - VS Code extension support
- **Codeium Adapter** - Codeium AI integration

## 🚀 Getting Started

### Development Setup

1. **Fork the repository** on GitHub
2. **Clone your fork**:
   ```bash
   git clone https://github.com/yourusername/repochief-adapters.git
   cd repochief-adapters
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Run tests** to ensure everything works:
   ```bash
   npm test
   ```

### Creating a New Adapter

1. **Use the template**: Copy `src/examples/adapter-template.js` as your starting point
2. **Implement required methods**:
   - `initialize(config)` - Set up your adapter
   - `executeTask(task)` - Execute tasks
   - `healthCheck()` - Verify adapter status
   - `shutdown()` - Clean up resources
3. **Define capabilities** accurately in your constructor
4. **Add comprehensive tests** in `tests/`
5. **Update documentation** as needed

### Adapter Implementation Checklist

- [ ] Extends `AIAgentAdapter` base class
- [ ] Implements all required methods
- [ ] Declares capabilities accurately
- [ ] Handles errors gracefully
- [ ] Includes comprehensive tests (>80% coverage)
- [ ] Follows coding standards (ESLint passes)
- [ ] Includes example usage
- [ ] Documents configuration options

## 📋 Development Guidelines

### Code Style

We use ESLint for code formatting. Run `npm run lint` before submitting.

**Key conventions:**
- Use `const` and `let`, not `var`
- Prefer async/await over Promises
- Use meaningful variable names
- Add JSDoc comments for public methods
- Keep functions focused and small

### Testing Requirements

All contributions must include tests:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test tests/my-adapter.test.js
```

**Test requirements:**
- Unit tests for all public methods
- Integration tests for task execution
- Error handling tests
- Capability detection tests
- Minimum 80% code coverage

### Documentation Standards

- Update README.md if adding new features
- Add JSDoc comments for all public methods
- Include configuration examples
- Document known limitations
- Add troubleshooting guides

## 🔄 Pull Request Process

### Before Submitting

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/my-new-adapter
   ```
2. **Make your changes** following the guidelines above
3. **Run the full test suite**:
   ```bash
   npm test
   npm run lint
   ```
4. **Update documentation** as needed
5. **Commit with clear messages**:
   ```bash
   git commit -m "feat: add Claude Code adapter with streaming support"
   ```

### Pull Request Guidelines

- **Use descriptive titles**: "feat: add Aider adapter" not "new adapter"
- **Include detailed description** of changes and why they're needed
- **Reference issues**: Use "Closes #123" if fixing an issue
- **Keep PRs focused**: One feature/fix per PR
- **Update CHANGELOG.md** for significant changes

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New adapter
- [ ] Feature enhancement
- [ ] Documentation update
- [ ] Test improvement

## Testing
- [ ] Tests pass locally
- [ ] Added tests for new functionality
- [ ] Updated existing tests if needed

## Documentation
- [ ] Updated README.md
- [ ] Added/updated JSDoc comments
- [ ] Updated relevant documentation

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review of code completed
- [ ] Changes tested thoroughly
- [ ] Documentation is clear and accurate
```

## 🏆 Recognition

### Contributor Levels

- **🌟 Contributor**: Made meaningful contributions
- **🚀 Core Contributor**: Regular, high-quality contributions
- **🎖️ Maintainer**: Trusted with review and release responsibilities

### Hall of Fame

Contributors who create high-quality adapters will be:
- Featured in the main README
- Given credit in release notes
- Invited to join the core team
- Eligible for maintainer status

## 📞 Getting Help

### Community Support

- **GitHub Discussions**: Ask questions and get help
- **Discord**: Real-time chat with the community
- **Email**: maintainers@repochief.com for sensitive issues

### Issue Guidelines

When reporting bugs:
- Use clear, descriptive titles
- Include adapter version and Node.js version
- Provide minimal reproduction steps
- Include relevant logs/error messages
- Tag with appropriate labels

### Feature Requests

When requesting features:
- Check if it already exists or is planned
- Explain the use case and benefit
- Consider if it fits the project scope
- Be willing to contribute to the implementation

## 📄 Legal

### Contributor License Agreement

By contributing to this project, you agree that:
- Your contributions will be licensed under the MIT License
- You have the right to license your contributions
- RepoChief Team may relicense the project if needed

### Code of Conduct

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

## 🎉 Thank You!

Every contribution, no matter how small, helps make RepoChief better for everyone. We appreciate your time and effort in improving this project!

---

**Questions?** Don't hesitate to reach out - we're here to help! 🚀