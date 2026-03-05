@Library('devop_itp_share_library@master') _

pipeline {
    agent any  // ✅ Runs directly on Linux Jenkins agent

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

        // 0️⃣ Verify Environment & Auto-Install Missing Tools ──────────────────
        stage('Verify: Environment that we have') {
            steps {
                sh '''
                echo "=== System Info ==="
                cat /etc/os-release | grep PRETTY_NAME

                # ── Node & NPM ────────────────────────────────────────────────
                echo "=== Node version ==="
                if ! command -v node > /dev/null 2>&1; then
                    echo "⚙️  Node not found — installing Node 20..."
                    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
                    sudo apt install -y nodejs
                    echo "✅ Node installed"
                fi
                node --version
                npm --version
                echo "✅ Node & NPM OK"

                # ── Git ───────────────────────────────────────────────────────
                echo "=== Git version ==="
                if ! command -v git > /dev/null 2>&1; then
                    echo "⚙️  Git not found — installing..."
                    sudo apt install -y git
                fi
                git --version
                echo "✅ Git OK"

                # ── curl ──────────────────────────────────────────────────────
                if ! command -v curl > /dev/null 2>&1; then
                    echo "⚙️  curl not found — installing..."
                    sudo apt install -y curl
                fi
                curl --version | head -1
                echo "✅ curl OK"

                # ── Docker ────────────────────────────────────────────────────
                echo "=== Docker version ==="
                if ! command -v docker > /dev/null 2>&1; then
                    echo "⚙️  Docker not found — installing..."
                    sudo apt install -y ca-certificates curl gnupg
                    sudo install -m 0755 -d /etc/apt/keyrings
                    curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
                    sudo chmod a+r /etc/apt/keyrings/docker.gpg
                    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
                      https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
                      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
                    sudo apt update
                    sudo apt install -y docker-ce docker-ce-cli containerd.io
                    sudo usermod -aG docker jenkins
                    echo "✅ Docker installed — restart Jenkins if permission errors occur"
                fi
                docker --version
                echo "✅ Docker OK"

                echo "✅ Environment check done"
                '''
            }
        }

        stage('Verify: Docker Daemon') {
            steps {
                sh '''
                echo "⏳ Checking Docker daemon..."

                # Start Docker service if not running
                if ! sudo systemctl is-active --quiet docker; then
                    echo "⚙️  Docker daemon not running — starting..."
                    sudo systemctl start docker
                fi

                # Wait for Docker to be ready with retry limit
                RETRIES=10
                COUNT=0
                until docker info > /dev/null 2>&1; do
                    COUNT=$((COUNT+1))
                    if [ $COUNT -ge $RETRIES ]; then
                        echo "❌ Docker daemon failed to start after ${RETRIES} attempts"
                        exit 1
                    fi
                    echo "   ...waiting ($COUNT/$RETRIES)"
                    sleep 3
                done

                echo "Docker info:"
                docker info | grep -E "Server Version|Operating System|Total Memory"
                echo "✅ Docker daemon is ready"
                '''
            }
        }

        stage('Verify: Credentials') {
            steps {
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
        // ──────────────────────────────────────────────────────────────────────

        // 1️⃣ Clone Next.js Code
        stage('Clone Code') {
            steps {
                git branch: 'master',
                    credentialsId: 'GITHUB-CREDENTIAL',
                    url: 'https://github.com/seang454/docuhub-admin'
            }
        }

        // 2️⃣ Install Dependencies & Run Tests
        stage('Install & Test') {
            steps {
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

        // 3️⃣ Prepare Dockerfile
        stage('Prepare Dockerfile') {
            steps {
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

        // 4️⃣ Build Docker Image
        stage('Build Image') {
            steps {
                sh '''
                docker build --no-cache -t ${REPO_NAME}/${IMAGE_NAME}:${TAG} .
                echo "✅ Image built: ${REPO_NAME}/${IMAGE_NAME}:${TAG}"
                '''
            }
        }

        // 5️⃣ Ensure Docker Hub Repo Exists
        stage('Ensure Docker Hub Repo Exists') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'DOCKERHUB-CREDENTIAL',
                    usernameVariable: 'DH_USERNAME',
                    passwordVariable: 'DH_PASSWORD'
                )]) {
                    sh '''
                    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
                      -u "$DH_USERNAME:$DH_PASSWORD" \
                      https://hub.docker.com/v2/repositories/$DH_USERNAME/$IMAGE_NAME/)

                    echo "DockerHub repo check status: $STATUS"

                    if [ "$STATUS" = "404" ] || [ -z "$STATUS" ]; then
                        echo "Repo not found, creating..."
                        TOKEN=$(curl -s -X POST \
                          -H "Content-Type: application/json" \
                          -d "{\"username\": \"$DH_USERNAME\", \"password\": \"$DH_PASSWORD\"}" \
                          https://hub.docker.com/v2/users/login/ | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

                        curl -s -X POST \
                          -H "Authorization: JWT $TOKEN" \
                          -H "Content-Type: application/json" \
                          -d "{\"name\":\"$IMAGE_NAME\",\"namespace\":\"$DH_USERNAME\",\"is_private\":false}" \
                          https://hub.docker.com/v2/repositories/
                        echo "✅ Repo created."
                    else
                        echo "✅ Repo already exists."
                    fi
                    '''
                }
            }
        }

        // 6️⃣ Push Docker Image
        stage('Push Image') {
            steps {
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

        // 7️⃣ Cleanup
        stage('Cleanup') {
            steps {
                sh '''
                rm -rf gitops-repo || true
                docker image prune -f || true
                echo "✅ Cleanup done"
                '''
            }
        }

        // 8️⃣ Update GitOps Repo — triggers Argo CD to deploy new image
        // stage('Update GitOps Repo') {
        //     steps {
        //         withCredentials([usernamePassword(
        //             credentialsId: 'GITOPS-GITHUB-CREDENTIAL',
        //             usernameVariable: 'GIT_USERNAME',
        //             passwordVariable: 'GIT_PASSWORD'
        //         )]) {
        //             sh '''
        //             echo "📦 Cloning GitOps repo..."
        //             git clone https://${GIT_USERNAME}:${GIT_PASSWORD}@${GITOPS_REPO} gitops-repo
        //             cd gitops-repo
        //             echo "🔄 Updating image tag to: ${TAG}"
        //             sed -i "s|tag:.*|tag: ${TAG}|" ${HELM_VALUES}
        //             echo "=== Updated image tag ==="
        //             grep "tag:" ${HELM_VALUES}
        //             git config user.email "jenkins-ci@mycompany.com"
        //             git config user.name "Jenkins CI"
        //             git add ${HELM_VALUES}
        //             git commit -m "ci: update nextjs image to ${TAG} [skip ci]"
        //             git push origin ${GITOPS_BRANCH}
        //             echo "✅ GitOps repo updated — Argo CD will deploy shortly"
        //             '''
        //         }
        //     }
        // }

        // // 9️⃣ Wait for Argo CD to Sync & Verify Deployment
        // stage('Verify Argo CD Deployment') {
        //     steps {
        //         withCredentials([usernamePassword(
        //             credentialsId: 'ARGOCD-CREDENTIAL',
        //             usernameVariable: 'ARGOCD_USERNAME',
        //             passwordVariable: 'ARGOCD_PASSWORD'
        //         )]) {
        //             sh '''
        //             echo "⏳ Waiting for Argo CD to detect changes (30s)..."
        //             sleep 30
        //             if ! command -v argocd &> /dev/null; then
        //                 echo "Installing Argo CD CLI..."
        //                 curl -sSL -o /usr/local/bin/argocd \
        //                     https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
        //                 chmod +x /usr/local/bin/argocd
        //             fi
        //             argocd login ${ARGOCD_SERVER} \
        //                 --username ${ARGOCD_USERNAME} \
        //                 --password ${ARGOCD_PASSWORD} \
        //                 --insecure
        //             echo "🔄 Triggering Argo CD sync for: ${ARGOCD_APP}"
        //             argocd app sync ${ARGOCD_APP}
        //             echo "⏳ Waiting for deployment to be healthy..."
        //             argocd app wait ${ARGOCD_APP} \
        //                 --sync \
        //                 --health \
        //                 --timeout 180
        //             argocd app get ${ARGOCD_APP}
        //             echo "✅ Deployment verified — ${IMAGE_NAME}:${TAG} is live!"
        //             '''
        //         }
        //     }
        // }
    }

    post {
        success {
            echo "🚀 Pipeline successful!"
            echo "   Image  : ${REPO_NAME}/${IMAGE_NAME}:${TAG}"
            echo "   App    : ${ARGOCD_APP}"
            echo "   Status : Live ✅"
        }
        failure {
            echo "❌ Pipeline failed. Check logs above."
        }
        always {
            cleanWs()  // ✅ Clean workspace after every build
        }
    }
}