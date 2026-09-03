---
globs: ["Dockerfile*", "docker-compose*.yml", "*.yaml", "**/k8s/**", "**/kubernetes/**", "**/helm/**"]
description: "Docker and Kubernetes best practices"
---

# Docker & Kubernetes Rules

## Dockerfile
- Use specific base image tags, not `latest`
- Multi-stage builds to reduce image size
- Run as non-root user
- Use .dockerignore to exclude unnecessary files
- Order layers from least to most frequently changed
- Combine RUN commands to reduce layers

## Docker Compose
- Use version 3.8+ syntax
- Define healthchecks
- Use named volumes for persistent data
- Set resource limits (memory, CPU)
- Use environment variables for configuration

## Kubernetes
- Use namespaces to isolate environments
- Set resource requests and limits
- Use ConfigMaps for configuration
- Use Secrets for sensitive data (encrypted)
- Define liveness and readiness probes
- Use Deployments, not bare Pods

## Security
- Scan images for vulnerabilities
- Use read-only root filesystem
- Drop all capabilities, add only needed
- Use network policies to restrict traffic
- Enable Pod Security Standards
