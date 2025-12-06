# 学生会智能排班系统 (SU-Scheduler)

这是一个专为学校学生会设计的智能值周排班系统，旨在简化繁琐的排班流程，确保任务分配的公平性与合理性。

## ✨ 主要功能

- **人员管理**：支持导入学生会成员名单（Excel格式），包含部门、年级、班级等信息。
- **多任务排班**：覆盖包干区检查、课间操、眼保健操、晚自习等多种常规值勤任务。
- **智能约束**：
    - **部门限制**：特定任务仅限特定部门成员（如纪检部、学习部等）执行。
    - **年级回避**：自动避免安排学生检查自己所在的年级或班级，确保公正。
- **可视化界面**：直观的排班表格，支持拖拽或点击分配（根据代码推测）。
- **导出功能**：支持将最终排班表导出为 Excel 或图片格式，便于分发。

## 🛠️ 技术栈

- **核心框架**: [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **构建工具**: [Vite](https://vitejs.dev/)
- **UI 组件**: 自定义组件 + [Lucide React](https://lucide.dev/) (图标)
- **工具库**:
    - `xlsx`: Excel 文件处理
    - `html2canvas`: 截图导出
    - `pinyin-pro`: 中文拼音处理

## 🚀 快速开始

### 环境要求

- Node.js (推荐 v16+)
- npm 或 yarn

### 安装步骤

1. 克隆项目到本地：
   ```bash
   git clone https://github.com/laoshuikaixue/SU-Scheduler.git
   ```

2. 进入项目目录并安装依赖：
   ```bash
   cd su-scheduler
   npm install
   ```

3. 启动开发服务器：
   ```bash
   npm run dev
   ```

4. 打开浏览器访问 `http://localhost:5173` 即可使用。

## 📂 项目结构

```
su-scheduler/
├── components/       # React 组件 (排班表、学生列表等)
├── services/         # 核心业务逻辑 (排班算法)
├── types.ts          # 类型定义 (学生、任务、部门枚举)
├── App.tsx           # 主应用入口
└── ...
```

## 📄 许可证

[GPL-3.0](LICENSE)
