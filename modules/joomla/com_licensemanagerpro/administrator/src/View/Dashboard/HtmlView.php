<?php
/**
 * License Manager Pro — administrator dashboard view.
 *
 * Loads the connection status, the product list (mint form) and the
 * recent licenses. API failures are caught here so the dashboard
 * still renders with a clear error instead of a white screen.
 */

declare(strict_types=1);

namespace Licensemanagerpro\Component\Licensemanagerpro\Administrator\View\Dashboard;

use Joomla\CMS\Component\ComponentHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\MVC\View\HtmlView as BaseHtmlView;
use Joomla\CMS\Toolbar\ToolbarHelper;
use Licensemanagerpro\Component\Licensemanagerpro\Administrator\Model\CycleMapper;
use Licensemanagerpro\Component\Licensemanagerpro\Administrator\Model\LicenseModel;
use Throwable;

class HtmlView extends BaseHtmlView
{
    public ?array $connection = null;
    public ?string $connectionError = null;
    /** @var array<int, array> */
    public array $products = [];
    /** @var array<int, array> */
    public array $licenses = [];
    public ?string $licenseError = null;
    /** @var array<string> */
    public array $cycles = CycleMapper::CYCLES;
    public \Joomla\Registry\Registry $params;
    public bool $apiKeyConfigured = false;

    public function display($tpl = null): void
    {
        ToolbarHelper::title(Text::_('COM_LICENSMANAGERPRO'), 'key');
        ToolbarHelper::preferences('com_licensemanagerpro');

        /** @var LicenseModel $model */
        $model = $this->getModel();

        try {
            $this->connection = $model->testConnection();
        } catch (Throwable $e) {
            $this->connectionError = $e->getMessage();
        }
        try {
            $this->products = $model->getProducts();
        } catch (Throwable $e) {
            $this->products = [];
        }
        try {
            $this->licenses = $model->getLicenses(null, null, 25);
        } catch (Throwable $e) {
            $this->licenseError = $e->getMessage();
        }

        $this->params = ComponentHelper::getParams('com_licensemanagerpro');
        $this->apiKeyConfigured = trim((string) $this->params->get('api_key', '')) !== '';

        parent::display($tpl);
    }
}
