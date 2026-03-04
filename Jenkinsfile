@Library('devop_itp_share_library@master') _

pipeline {
    agent {
        kubernetes {
            yaml libraryResource('next/pod-template.yaml')  // ✅ reads from shared library
            defaultContainer 'node'
        }
    }

    environment {
        REPO_NAME      = 'seang454'
        IMAGE_NAME     = 'jenkins-itp-nextjs'
        TAG            = "${GIT_COMMIT[0..6]}"
        CONTAINER_NAME = 'nextjs-app'
        PORT           = '3000'

        GITOPS_REPO    = 'github.com/seang454/jenkin-argo-gitops'
        GITOPS_BRANCH  = 'main'
        HELM_VALUES    = 'charts/frontend/values-dev.yaml'
        ARGOCD_APP     = 'frontend-dev'
        ARGOCD_SERVER  = 'argocd.seang.shop'
    }

    stages {

        // 0️⃣ Verify Pod Agent is Working on Kubernetes ─────────────────────────
        stage('Verify: Node Container') {
            steps {
                container('node') {
                    sh '''
                    echo "=== Node Container ==="
                    echo "OS:"
                    cat /etc/os-release | grep PRETTY_NAME
                    echo "Node version:"
                    node --version
                    echo "NPM version:"
                    npm --version
                    echo "Git version:"
                    git --version || echo "❌ git NOT found — need to install it"
                    echo "✅ Node container OK"
                    '''
                }
            }
        }

        stage('Verify: Docker Container') {
            steps {
                container('docker') {
                    sh '''
                    echo "=== Docker Container ==="
                    echo "⏳ Waiting for Docker daemon..."
                    until docker info > /dev/null 2>&1; do
                        echo "   ...waiting"
                        sleep 2
                    done
                    echo "Docker version:"
                    docker version
                    echo "Docker info (brief):"
                    docker info | grep -E "Server Version|Operating System|Total Memory"
                    echo "✅ Docker container OK"
                    '''
                }
            }
        }

        stage('Verify: Shared Workspace') {
            steps {
                container('node') {
                    sh 'echo "hello from node" > /workspace/test-file.txt'
                }
                container('docker') {
                    sh '''
                    echo "=== Shared Workspace ==="
                    echo "File written by node container:"
                    cat /workspace/test-file.txt || echo "❌ Workspace NOT shared"
                    rm -f /workspace/test-file.txt
                    echo "✅ Shared workspace OK"
                    '''
                }
            }
        }

        stage('Verify: Credentials') {
            steps {
                container('node') {
                    withCredentials([usernamePassword(
                        credentialsId: 'DOCKERHUB-CREDENTIAL',
                        usernameVariable: 'DH_USERNAME',
                        passwordVariable: 'DH_PASSWORD'
                    )]) {
                        sh '''
                        echo "=== Credentials ==="
                        echo "DockerHub username: $DH_USERNAME"
                        echo "DockerHub password length: ${#DH_PASSWORD} chars"
                        echo "✅ DOCKERHUB-CREDENTIAL OK"
                        '''
                    }
                }
            }
        }
        // ──────────────────────────────────────────────────────────────────────

        // 1️⃣ Clone Next.js Code
        stage('Clone Code') {
            steps {
                container('node') {
                    git branch: 'master',
                        credentialsId: 'GITHUB-CREDENTIAL',
                        url: 'https://github.com/seang454/frontend-docuhub'
                }
            }
        }

        // 2️⃣ Install Dependencies & Run Tests
        stage('Install & Test') {
            steps {
                container('node') {
                    script {
                        if (fileExists('package.json')) {
                            sh '''
                            node --version
                            npm --version
                            npm ci
                            npm run test --if-present
                            '''
                        } else {
                            error "No package.json found — is this a Next.js project?"
                        }
                    }
                }
            }
        }

        // 3️⃣ Prepare Dockerfile
        stage('Prepare Dockerfile') {
            steps {
                container('node') {
                    script {
                        def sharedDockerfile = libraryResource 'next/dev.Dockerfile'
                        def dockerfilePath   = 'Dockerfile'

                        if (fileExists(dockerfilePath)) {
                            def existingDockerfile = readFile(dockerfilePath)
                            if (existingDockerfile != sharedDockerfile) {
                                echo 'Dockerfile differs from shared library. Replacing it.'
                                sh "rm -f ${dockerfilePath}"
                                writeFile file: dockerfilePath, text: sharedDockerfile
                            } else {
                                echo 'Dockerfile is already up-to-date.'
                            }
                        } else {
                            echo 'Dockerfile not found. Creating from shared library.'
                            writeFile file: dockerfilePath, text: sharedDockerfile
                        }
                    }
                }
            }
        }

        // 4️⃣ Build Docker Image
        stage('Build Image') {
            steps {
                container('docker') {
                    sh '''
                    echo "⏳ Waiting for Docker daemon..."
                    until docker info > /dev/null 2>&1; do sleep 2; done
                    echo "✅ Docker daemon is ready."
                    docker build --no-cache -t ${REPO_NAME}/${IMAGE_NAME}:${TAG} .
                    '''
                }
            }
        }

        // 5️⃣ Ensure Docker Hub Repo Exists
        stage('Ensure Docker Hub Repo Exists') {
            steps {
                container('docker') {
                    withCredentials([usernamePassword(
                        credentialsId: 'DOCKERHUB-CREDENTIAL',
                        usernameVariable: 'DH_USERNAME',
                        passwordVariable: 'DH_PASSWORD'
                    )]) {
                        sh '''
                        STATUS=$(wget -qO- --server-response \
                          --header="Authorization: Basic $(echo -n $DH_USERNAME:$DH_PASSWORD | base64)" \
                          https://hub.docker.com/v2/repositories/$DH_USERNAME/$IMAGE_NAME/ 2>&1 \
                          | grep "HTTP/" | awk '{print $2}' | tail -1)

                        echo "DockerHub repo check status: $STATUS"

                        if [ "$STATUS" = "404" ] || [ -z "$STATUS" ]; then
                          echo "Repo not found, creating..."
                          TOKEN=$(wget -qO- --post-data="username=$DH_USERNAME&password=$DH_PASSWORD" \
                            https://hub.docker.com/v2/users/login/ | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

                          wget -qO- --header="Authorization: JWT $TOKEN" \
                            --header="Content-Type: application/json" \
                            --post-data="{\"name\":\"$IMAGE_NAME\",\"namespace\":\"$DH_USERNAME\",\"is_private\":false}" \
                            https://hub.docker.com/v2/repositories/
                          echo "✅ Repo created."
                        else
                          echo "✅ Repo already exists."
                        fi
                        '''
                    }
                }
            }
        }

        // 6️⃣ Push Docker Image
        stage('Push Image') {
            steps {
                container('docker') {
                    withCredentials([usernamePassword(
                        credentialsId: 'DOCKERHUB-CREDENTIAL',
                        usernameVariable: 'DH_USERNAME',
                        passwordVariable: 'DH_PASSWORD'
                    )]) {
                        sh '''
                        echo "$DH_PASSWORD" | docker login -u "$DH_USERNAME" --password-stdin
                        docker push ${REPO_NAME}/${IMAGE_NAME}:${TAG}
                        docker logout
                        echo "✅ Image pushed: ${REPO_NAME}/${IMAGE_NAME}:${TAG}"
                        '''
                    }
                }
            }
        }

        // 7️⃣ Cleanup
        stage('Cleanup') {
            steps {
                container('node') {
                    sh 'rm -rf gitops-repo || true'
                }
                container('docker') {
                    sh 'docker image prune -f || true'
                }
            }
        }

        // 8️⃣ Update GitOps Repo — triggers Argo CD to deploy new image
        // stage('Update GitOps Repo') {
        //     steps {
        //         container('node') {
        //             withCredentials([usernamePassword(
        //                 credentialsId: 'GITOPS-GITHUB-CREDENTIAL',
        //                 usernameVariable: 'GIT_USERNAME',
        //                 passwordVariable: 'GIT_PASSWORD'
        //             )]) {
        //                 sh '''
        //                 echo "📦 Cloning GitOps repo..."
        //                 git clone https://${GIT_USERNAME}:${GIT_PASSWORD}@${GITOPS_REPO} gitops-repo
        //                 cd gitops-repo
        //                 echo "🔄 Updating image tag to: ${TAG}"
        //                 sed -i "s|tag:.*|tag: ${TAG}|" ${HELM_VALUES}
        //                 echo "=== Updated image tag ==="
        //                 grep "tag:" ${HELM_VALUES}
        //                 git config user.email "jenkins-ci@mycompany.com"
        //                 git config user.name "Jenkins CI"
        //                 git add ${HELM_VALUES}
        //                 git commit -m "ci: update nextjs image to ${TAG} [skip ci]"
        //                 git push origin ${GITOPS_BRANCH}
        //                 echo "✅ GitOps repo updated — Argo CD will deploy shortly"
        //                 '''
        //             }
        //         }
        //     }
        // }

        // // 9️⃣ Wait for Argo CD to Sync & Verify Deployment
        // stage('Verify Argo CD Deployment') {
        //     steps {
        //         container('node') {
        //             withCredentials([usernamePassword(
        //                 credentialsId: 'ARGOCD-CREDENTIAL',
        //                 usernameVariable: 'ARGOCD_USERNAME',
        //                 passwordVariable: 'ARGOCD_PASSWORD'
        //             )]) {
        //                 sh '''
        //                 echo "⏳ Waiting for Argo CD to detect changes (30s)..."
        //                 sleep 30
        //                 if ! command -v argocd &> /dev/null; then
        //                     echo "Installing Argo CD CLI..."
        //                     curl -sSL -o /usr/local/bin/argocd \
        //                         https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
        //                     chmod +x /usr/local/bin/argocd
        //                 fi
        //                 argocd login ${ARGOCD_SERVER} \
        //                     --username ${ARGOCD_USERNAME} \
        //                     --password ${ARGOCD_PASSWORD} \
        //                     --insecure
        //                 echo "🔄 Triggering Argo CD sync for: ${ARGOCD_APP}"
        //                 argocd app sync ${ARGOCD_APP}
        //                 echo "⏳ Waiting for deployment to be healthy..."
        //                 argocd app wait ${ARGOCD_APP} \
        //                     --sync \
        //                     --health \
        //                     --timeout 180
        //                 argocd app get ${ARGOCD_APP}
        //                 echo "✅ Deployment verified — ${IMAGE_NAME}:${TAG} is live!"
        //                 '''
        //             }
        //         }
        //     }
        // }
    }

    post {
        success {
            echo "🚀 Full GitOps pipeline successful!"
            echo "   Image  : ${REPO_NAME}/${IMAGE_NAME}:${TAG}"
            echo "   App    : ${ARGOCD_APP}"
            echo "   Status : Live ✅"
        }
        failure {
            echo "❌ Pipeline failed. Check logs above."
        }
    }
}