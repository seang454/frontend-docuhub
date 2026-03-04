@Library('devop_itp_share_library@master') _

pipeline {
    agent {
        kubernetes {
            yamlFile 'next/pod-template.yaml'
            defaultContainer 'node'
        }
    }

    environment {
        REPO_NAME      = 'seang454'   // 🔁 Change this
        IMAGE_NAME     = 'jenkins-itp-nextjs'
        TAG            = 'latest'
        CONTAINER_NAME = 'nextjs-app'
        PORT           = '3000'
    }

    stages {

        // 1️⃣ Clone Next.js Code
        stage('Clone Code') {
            steps {
                git 'https://github.com/seang454/frontend-docuhub'  // 🔁 Change this
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
    }

    post {
        success {
            echo "🚀 Build & push successful: ${REPO_NAME}/${IMAGE_NAME}:${TAG}"
        }
        failure {
            echo "❌ Pipeline failed. Check logs above."
        }
        always {
            container('docker') {
                sh 'docker image prune -f || true'
            }
        }
    }
}